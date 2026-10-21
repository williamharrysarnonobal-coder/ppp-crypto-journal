# btc_live_bot_v2.py: BTC alerts, six setups (2026-10-16).
#   5M HL/LH: v1 rules + 1M MACD below zero (long) / above zero (short).
#   15M HL/LH and 30M invalidation: the 5M replaces the 3M.
#   30M Long / Short Invalidation: 1H needs only the histogram colour
#   (green for long, red for short), not the MACD side of zero.
#   1H setups removed. Secrets are in bot_secrets.py (gitignored); this file is safe to commit.
import html
import os
import time
import logging
import requests
import pandas as pd
from datetime import datetime, timezone, timedelta
from binance.client import Client

# ==========================
# CONFIG
# ==========================
# Secrets live in bot_secrets.py (gitignored, never committed).
import bot_secrets
BOT_TOKEN = bot_secrets.BTC_BOT_TOKEN
CHAT_ID = bot_secrets.BTC_CHAT_ID
if "PASTE_YOUR" in BOT_TOKEN or "PASTE_YOUR" in CHAT_ID:
    raise SystemExit(
        "ERROR: You still need to edit this file and replace "
        "BOT_TOKEN and CHAT_ID above with your real values."
    )

# Supabase — writes the bot's live state so the web dashboard's Trade
# Alerts page can show it. Uses the service_role key (full write access,
# bypasses RLS) since this script runs on your own machine, never a
# browser. This file is gitignored — never commit it with real values.
SUPABASE_URL = bot_secrets.SUPABASE_URL
SUPABASE_SERVICE_KEY = bot_secrets.SUPABASE_SERVICE_KEY
SUPABASE_TABLE = "trading_signals"

if "PASTE_YOUR" in SUPABASE_SERVICE_KEY:
    raise SystemExit(
        "ERROR: You still need to edit this file and replace "
        "SUPABASE_SERVICE_KEY in bot_secrets.py with your real secret key."
    )

SYMBOL = "BTCUSDT"  # USDT-M Perpetual (BTCUSDT.P)
POLL_SECONDS = 60          # base loop tick (we align inside this)
CANDLE_SECONDS = 300       # align checks to 5-minute candle closes
REQUEST_TIMEOUT = 10
ALERT_COOLDOWN_SECONDS = 300   # fallback when a setup has no entry below
# The same setup may not alert again within its own window, even if its
# condition flickers off for a candle and back on (that used to re-send the
# same 15M setup five times in 2.5 hours). Longer timeframe, longer window.
COOLDOWN_BY_KEY = {
    "5m_hl": 30 * 60, "5m_lh": 30 * 60,
    "15m_hl": 60 * 60, "15m_lh": 60 * 60,
    "30m_long": 90 * 60, "30m_short": 90 * 60,
}
ERROR_ALERT_THRESHOLD = 10     # send a Telegram alert after this many consecutive failures

# Heartbeat / quiet hours config
UAE_OFFSET = timedelta(hours=4)  # UAE is UTC+4, no DST
UAE_TZ = timezone(UAE_OFFSET)
HEARTBEAT_INTERVAL_SECONDS = 2 * 60 * 60  # every 2 hours
# The Telegram heartbeat message is off (2026-10-16): the app's "BTC Bot is
# offline" push watches trading_signals.heartbeat_at, which is still written
# every cycle. Set True to get the 2-hourly Telegram message back.
SEND_TELEGRAM_HEARTBEAT = False
# Telegram carries setup alerts only (2026-10-16): no startup message, no
# daily summary, no "failed N cycles" warning. A dead or stuck bot is caught
# by the app's offline push instead. Set True to bring them back.
SEND_TELEGRAM_STATUS = False
QUIET_START_HOUR = 0      # 12:00 AM UAE time
QUIET_END_HOUR = 7        # quiet until 7:30 AM UAE time
QUIET_END_MINUTE = 30
DAILY_SUMMARY_HOUR = 8    # send once-a-day setup summary at 8:00 AM UAE time
# No setup alerts at all while you sleep: not sent to Telegram and not written
# to signal_alerts (so no app popup or phone push either).
ALERT_QUIET_START_HOUR = 0   # 12:00 AM UAE
ALERT_QUIET_END_HOUR = 7     # until 7:00 AM UAE

LOG_DIR = r"C:\Users\Lenovo\Documents\BTC_BOT"
LOG_PATH = os.path.join(LOG_DIR, "bot_v2.log")
# When each setup last alerted — kept on disk so a restart does not re-send
# a setup that alerted just before it.
LAST_SENT_PATH = os.path.join(LOG_DIR, "btc_last_sent_v2.json")

# ==========================
# LOGGING SETUP
# ==========================
# Make sure the folder exists before we try to write a log file into it
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    filename=LOG_PATH,
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s"
)

# Also print to console so you can watch it live
console = logging.StreamHandler()
console.setLevel(logging.INFO)
console.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
logging.getLogger().addHandler(console)

logging.info("Bot script started.")

client = Client()


# ==========================
# TELEGRAM
# ==========================
def send(msg, html_mode=False):
    """html_mode: msg is Telegram HTML (links), with the link preview off."""
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = {"chat_id": CHAT_ID, "text": msg}
    if html_mode:
        data.update({"parse_mode": "HTML", "disable_web_page_preview": "true"})
    # A dropped connection (SSL EOF, timeout) or a Telegram 5xx/429 is retried
    # (after 5s, 15s, 30s, 60s) so a network blip, or Wi-Fi still reconnecting after
    # the laptop wakes from standby, doesn't lose an alert.
    # A 400 (bad chat id, bad HTML) is not retried: it would fail the same way.
    # The token is masked in the log.
    for attempt, wait in enumerate((5, 15, 30, 60, None), start=1):
        try:
            resp = requests.post(url, data=data, timeout=REQUEST_TIMEOUT)
            body = resp.json()
            if body.get("ok", False):
                if attempt > 1:
                    logging.info(f"TELEGRAM SENT on attempt {attempt}")
                return True
            logging.error(f"TELEGRAM ERROR: {body}")
            if not (resp.status_code == 429 or resp.status_code >= 500):
                return False
        except Exception as e:
            logging.error(f"TELEGRAM SEND FAILED (attempt {attempt}): {str(e).replace(BOT_TOKEN, '<token>')}")
        if wait is None:
            return False
        time.sleep(wait)


# ==========================
# SUPABASE (live state for the web dashboard's Trade Alerts page)
# ==========================
def push_signals_to_supabase(rows):
    if not rows:
        return
    url = f"{SUPABASE_URL}/rest/v1/{SUPABASE_TABLE}?on_conflict=symbol"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }
    try:
        resp = requests.post(url, headers=headers, json=rows, timeout=REQUEST_TIMEOUT)
        if resp.status_code >= 300:
            logging.error(f"SUPABASE ERROR: {resp.status_code} {resp.text[:300]}")
    except Exception as e:
        logging.error(f"SUPABASE PUSH FAILED: {e}")


BTC_TRADINGVIEW_URL = "https://www.tradingview.com/chart/?symbol=BINANCE%3ABTCUSDT.P"


def insert_signal_alert(row):
    """Inserts one row per fired alert into signal_alerts (a real history
    log), instead of overwriting a single per-symbol row like
    push_signals_to_supabase does."""
    url = f"{SUPABASE_URL}/rest/v1/signal_alerts"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
    try:
        resp = requests.post(url, headers=headers, json=[row], timeout=REQUEST_TIMEOUT)
        if resp.status_code >= 300:
            logging.error(f"SUPABASE ALERT INSERT ERROR: {resp.status_code} {resp.text[:300]}")
    except Exception as e:
        logging.error(f"SUPABASE ALERT INSERT FAILED: {e}")


def fetch_btc_volume():
    try:
        ticker = client.futures_ticker(symbol=SYMBOL)
        vol = ticker.get("quoteVolume")
        return float(vol) if vol is not None else None
    except Exception as e:
        logging.error(f"ERROR fetching volume: {e}")
        return None


# ==========================
# BINANCE DATA (USDT-M PERPETUAL FUTURES)
# ==========================
def get_data(tf):
    klines = client.futures_klines(
        symbol=SYMBOL,
        interval=tf,
        limit=200
    )

    df = pd.DataFrame(
        klines,
        columns=[
            "open_time",
            "open",
            "high",
            "low",
            "close",
            "volume",
            "close_time",
            "qav",
            "num_trades",
            "tbbav",
            "tbqav",
            "ignore"
        ]
    )

    for col in ("open", "high", "low", "close", "volume"):
        df[col] = df[col].astype(float)

    return df


# ==========================
# MACD CALCULATION
# ==========================
def get_macd(df):
    ema_fast = df["close"].ewm(span=12, adjust=False).mean()
    ema_slow = df["close"].ewm(span=26, adjust=False).mean()

    macd = ema_fast - ema_slow
    signal = macd.ewm(span=9, adjust=False).mean()
    hist = macd - signal

    return macd, hist


def last(series):
    return series.iloc[-2]


# ==========================
# FETCH MACD/HIST + LAST CLOSE PRICE, PER TIMEFRAME
# ==========================
def fetch_macd_hist(tf):
    try:
        df = get_data(tf)
        macd, hist = get_macd(df)
        price = df["close"].iloc[-2]
        # Typical recent magnitude of each line (excludes the still-open
        # candle), used to judge how close a value is to crossing zero
        macd_std = macd.iloc[-22:-2].std()
        hist_std = hist.iloc[-22:-2].std()
        return last(macd), last(hist), price, macd_std, hist_std
    except Exception as e:
        logging.error(f"ERROR fetching {tf}: {e}")
        return None, None, None, None, None


# ==========================
# ALERT STATE (DEDUP + COOLDOWN)
# ==========================
state = {
    "5m_hl": {"active": False, "last_sent": 0},
    "5m_lh": {"active": False, "last_sent": 0},
    "15m_hl": {"active": False, "last_sent": 0},
    "15m_lh": {"active": False, "last_sent": 0},
    "30m_long": {"active": False, "last_sent": 0},
    "30m_short": {"active": False, "last_sent": 0},
}


def _load_last_sent():
    try:
        import json
        with open(LAST_SENT_PATH, "r", encoding="utf-8") as f:
            saved = json.load(f)
        for k, v in saved.items():
            if k in state:
                state[k]["last_sent"] = float(v)
    except Exception:
        pass


def _save_last_sent():
    try:
        import json
        with open(LAST_SENT_PATH, "w", encoding="utf-8") as f:
            json.dump({k: v["last_sent"] for k, v in state.items()}, f)
    except Exception as e:
        logging.error(f"Could not save last-sent times: {e}")


_load_last_sent()


# ==========================
# ALERT COUNT PER COIN (resets every day at 7 AM UAE)
# ==========================
# "15M HL - Alert #2 today": how many times this setup has alerted for this
# coin today, so repeats are easy to spot. The day
# starts at 7 AM UAE (after the quiet hours). Kept on disk so a restart does not
# start the count again from #1.
ALERT_COUNT_PATH = os.path.join(LOG_DIR, "btc_alert_counts_v2.json")
ALERT_DAY_START_HOUR = 7


def _alert_day():
    return (datetime.now(UAE_TZ) - timedelta(hours=ALERT_DAY_START_HOUR)).strftime("%Y-%m-%d")


def _short_setup(name):
    return (name.replace(" Setup", "").replace("Higher Low", "HL").replace("Lower High", "LH")
            .replace("Invalidation", "Inv"))


def count_alert(coin, setup_name):
    """Counts this alert and returns the line for the message."""
    import json as _json
    day = _alert_day()
    try:
        with open(ALERT_COUNT_PATH, "r", encoding="utf-8") as f:
            data = _json.load(f)
    except Exception:
        data = {}
    if data.get("day") != day:
        data = {"day": day, "coins": {}}
    per = data["coins"].setdefault(coin, {})
    short = _short_setup(setup_name)
    per[short] = per.get(short, 0) + 1
    try:
        with open(ALERT_COUNT_PATH, "w", encoding="utf-8") as f:
            _json.dump(data, f)
    except Exception as e:
        logging.error(f"Could not save alert counts: {e}")
    # Per coin AND setup: "15M HL - Alert #2 today" = the same setup came back.
    return f"{short} - Alert #{per[short]} today"


def in_alert_quiet_hours():
    h = datetime.now(UAE_TZ).hour
    return ALERT_QUIET_START_HOUR <= h < ALERT_QUIET_END_HOUR


def maybe_alert(key, condition, message, display_name, volume):
    now = time.time()
    s = state[key]

    if condition and in_alert_quiet_hours():
        if not s["active"]:
            logging.info(f"ALERT SKIPPED [{key}] (quiet hours 12AM-7AM)")
        s["active"] = True
        return

    if condition:
        cooled_down = (now - s["last_sent"]) >= COOLDOWN_BY_KEY.get(key, ALERT_COOLDOWN_SECONDS)
        if not s["active"] and cooled_down:
            # Pang-ilang alert na ng BTC ngayong araw, sa ilalim ng pamagat.
            title, _, rest = message.partition("\n")
            message = f"{title}\n{count_alert('BTC', display_name)}\n{rest}"
            # A tap on the last line opens the BTC chart on TradingView.
            telegram_message = (html.escape(message)
                + f'\n\n<a href="{BTC_TRADINGVIEW_URL}">Open BTC chart on TradingView</a>')
            send(telegram_message, html_mode=True)
            logging.info(f"ALERT SENT [{key}]: {message}")
            s["last_sent"] = now
            _save_last_sent()
            last_setup["name"] = display_name
            last_setup["time"] = now
            trigger_log.append((now, display_name))
            # Insert the exact same message + moment as its own row in
            # signal_alerts, so the dashboard's Trade Alerts page keeps a
            # full history matching Telegram, instead of overwriting a
            # single per-symbol "closest setup" heartbeat row.
            insert_signal_alert({
                "symbol": "BTC",
                "category": "bitcoin",
                "setup": display_name,
                "message": message,
                "volume": volume,
                "tradingview_url": BTC_TRADINGVIEW_URL,
                "alert_at": datetime.now(timezone.utc).isoformat(),
            })
        s["active"] = True
    else:
        s["active"] = False


# Tracks the most recent setup that actually fired, for the heartbeat message
last_setup = {"name": None, "time": None}

# Tracks every (timestamp, setup_name) trigger for the daily summary
trigger_log = []


def send_daily_summary():
    cutoff = time.time() - 24 * 60 * 60
    recent = [name for ts, name in trigger_log if ts >= cutoff]

    if not recent:
        body = "No setups triggered in the last 24 hours."
    else:
        counts = {}
        for name in recent:
            counts[name] = counts.get(name, 0) + 1
        lines = [f"{name}: {count}x" for name, count in sorted(counts.items(), key=lambda x: -x[1])]
        body = "\n".join(lines)

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    msg = (
        f"📊 BTC.P Daily Summary (last 24h)\n"
        f"Time: {now_str}\n\n"
        f"{body}"
    )
    send(msg)
    logging.info("Daily summary sent.")

    # Trim the log so it doesn't grow forever
    trigger_log[:] = [(ts, name) for ts, name in trigger_log if ts >= cutoff]


def in_quiet_hours():
    now_uae = datetime.now(UAE_TZ)
    start = now_uae.replace(hour=QUIET_START_HOUR, minute=0, second=0, microsecond=0)
    end = now_uae.replace(hour=QUIET_END_HOUR, minute=QUIET_END_MINUTE, second=0, microsecond=0)
    return start <= now_uae < end


def format_last_setup():
    if last_setup["name"] is None:
        return "None yet since bot started"
    elapsed = time.time() - last_setup["time"]
    hours = int(elapsed // 3600)
    minutes = int((elapsed % 3600) // 60)
    if hours > 0:
        ago = f"{hours}h {minutes}m ago"
    else:
        ago = f"{minutes}m ago"
    return f"{last_setup['name']} ({ago})"


def bias_emoji(value):
    return "🟢" if value > 0 else "🔴"


def proximity_words(value, std):
    """Describe in words how close `value` is to crossing zero,
    relative to its own typical recent magnitude (std)."""
    if value is None or std is None or std == 0:
        return "unclear"
    ratio = abs(value) / std
    if ratio < 0.25:
        return "very close to flipping"
    elif ratio < 0.6:
        return "getting close"
    elif ratio < 1.2:
        return "moderate distance"
    else:
        return "far from flipping"


def compute_closest_setup(setup_confluence):
    """Find the setup with the highest confluence ratio (met / total).
    Used both for the Telegram heartbeat and the every-cycle Supabase push."""
    best_name, best_checks = max(
        setup_confluence,
        key=lambda x: sum(1 for _, ok, *_ in x[1] if ok) / len(x[1])
    )
    met = [label for label, ok, *_ in best_checks if ok]
    unmet = [
        {"condition": label, "note": proximity_words(value, std)}
        for label, ok, value, std in best_checks if not ok
    ]
    return best_name, met, unmet, len(best_checks)


def send_heartbeat(h12, h4, h1, setup_confluence):
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")

    bias_line = (
        f"12H {bias_emoji(h12)} | 4H {bias_emoji(h4)} | 1H {bias_emoji(h1)}"
    )

    best_name, met, unmet, total = compute_closest_setup(setup_confluence)

    met_lines = "\n".join(f"✅ {label}" for label in met) or "—"
    unmet_lines = "\n".join(f"❌ {u['condition']} — {u['note']}" for u in unmet) or "—"

    msg = (
        f"🤖 BTC.P Bot Heartbeat\n"
        f"Time: {now_str}\n\n"
        f"Last Setup: {format_last_setup()}\n\n"
        f"Market Bias:\n{bias_line}\n\n"
        f"Closest to Triggering: {best_name} "
        f"({len(met)}/{total} Confluence Met)\n\n"
        f"Met:\n{met_lines}\n\n"
        f"Not Met:\n{unmet_lines}"
    )
    send(msg)
    logging.info("Heartbeat sent.")


# ==========================
# STARTUP ALERT
# ==========================
if SEND_TELEGRAM_STATUS:
    send(f"✅ BTC.P MTF Alert Bot started\nTime: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    logging.info("Startup Telegram alert sent.")
logging.info("Bot running (Telegram: setup alerts only).")


# ==========================
# MAIN LOOP
# ==========================
consecutive_errors = 0
error_alert_sent = False
last_heartbeat = {"time": 0}  # 0 means "send heartbeat on first eligible cycle"
last_daily_summary_date = {"date": None}

while True:
    cycle_start = time.time()
    try:
        m12, h12, _, m12_std, h12_std = fetch_macd_hist("12h")
        m4, h4, _, m4_std, h4_std = fetch_macd_hist("4h")
        m1, h1, p1, m1_std, h1_std = fetch_macd_hist("1h")
        m30, h30, p30, m30_std, h30_std = fetch_macd_hist("30m")
        m15, h15, p15, m15_std, h15_std = fetch_macd_hist("15m")
        m5, h5, p5, m5_std, h5_std = fetch_macd_hist("5m")
        mm1, hm1, _, mm1_std, hm1_std = fetch_macd_hist("1m")   # 1 minute (m1 is the 1H)

        values = [m12, h12, m4, h4, m1, h1, m30, h30, m15, h15, m5, h5, mm1, hm1]

        if any(v is None for v in values):
            consecutive_errors += 1
            logging.warning(
                f"Skipping cycle: fetch failure "
                f"({consecutive_errors}/{ERROR_ALERT_THRESHOLD})"
            )
            if SEND_TELEGRAM_STATUS and consecutive_errors >= ERROR_ALERT_THRESHOLD and not error_alert_sent:
                send(
                    f"⚠️ BTC.P bot has failed {consecutive_errors} cycles "
                    f"in a row. Check the bot — it may be stuck or "
                    f"Binance/network may be down."
                )
                error_alert_sent = True
            time.sleep(POLL_SECONDS)
            continue
        else:
            consecutive_errors = 0
            error_alert_sent = False

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
        volume = fetch_btc_volume()

        # ======================
        # CONDITIONS
        # ======================
        cond_5m_hl = (h1 > 0 and m1 > 0 and h15 > 0 and m15 > 0 and h5 < 0 and m5 > 0 and mm1 < 0)
        cond_5m_lh = (h1 < 0 and m1 < 0 and h15 < 0 and m15 < 0 and h5 > 0 and m5 < 0 and mm1 > 0)
        # 30M must be in bull territory with a green histogram (2026-10-16).
        cond_15m_hl = (h4 > 0 and h1 > 0 and m1 > 0 and m30 > 0 and h30 > 0 and h15 < 0 and m15 > 0 and h5 > 0 and m5 < 0)
        cond_15m_lh = (h4 < 0 and h1 < 0 and m1 < 0 and m30 < 0 and h30 < 0 and h15 > 0 and m15 < 0 and h5 < 0 and m5 > 0)
        # 30M Long Invalidation: 1H MACD on the far side of zero with the histogram turned (as in the Playbook), so it never fires together with 15M HL/LH.
        cond_30m_long = ((h4 > 0 or m4 > 0) and m1 < 0 and h1 > 0 and h30 > 0 and m30 > 0 and h15 < 0 and m15 > 0 and h5 < 0 and m5 < 0)
        # 30M Short Invalidation: 1H MACD above zero with a red histogram.
        cond_30m_short = ((h4 < 0 or m4 < 0) and m1 > 0 and h1 < 0 and h30 < 0 and m30 < 0 and h15 > 0 and m15 < 0 and h5 > 0 and m5 > 0)

        # Individual confluence checks per setup, used for the heartbeat's
        # "closest to triggering" calculation and met/unmet breakdown
        setup_confluence = [
            ("5M Higher Low", [
                ("1H MACD positive", m1 > 0, m1, m1_std),
                ("1H Histogram positive", h1 > 0, h1, h1_std),
                ("15M MACD positive", m15 > 0, m15, m15_std),
                ("15M Histogram positive", h15 > 0, h15, h15_std),
                ("5M MACD positive", m5 > 0, m5, m5_std),
                ("5M Histogram negative", h5 < 0, h5, h5_std),
                ("1M MACD negative", mm1 < 0, mm1, mm1_std),
            ]),
            ("5M Lower High", [
                ("1H MACD negative", m1 < 0, m1, m1_std),
                ("1H Histogram negative", h1 < 0, h1, h1_std),
                ("15M MACD negative", m15 < 0, m15, m15_std),
                ("15M Histogram negative", h15 < 0, h15, h15_std),
                ("5M MACD negative", m5 < 0, m5, m5_std),
                ("5M Histogram positive", h5 > 0, h5, h5_std),
                ("1M MACD positive", mm1 > 0, mm1, mm1_std),
            ]),
            ("15M Higher Low", [
                ("4H Histogram positive", h4 > 0, h4, h4_std),
                ("1H MACD positive", m1 > 0, m1, m1_std),
                ("1H Histogram positive", h1 > 0, h1, h1_std),
                ("30M MACD positive", m30 > 0, m30, m30_std),
                ("30M Histogram positive", h30 > 0, h30, h30_std),
                ("15M MACD positive", m15 > 0, m15, m15_std),
                ("15M Histogram negative", h15 < 0, h15, h15_std),
                ("5M MACD negative", m5 < 0, m5, m5_std),
                ("5M Histogram positive", h5 > 0, h5, h5_std),
            ]),
            ("15M Lower High", [
                ("4H Histogram negative", h4 < 0, h4, h4_std),
                ("1H MACD negative", m1 < 0, m1, m1_std),
                ("1H Histogram negative", h1 < 0, h1, h1_std),
                ("30M MACD negative", m30 < 0, m30, m30_std),
                ("30M Histogram negative", h30 < 0, h30, h30_std),
                ("15M MACD negative", m15 < 0, m15, m15_std),
                ("15M Histogram positive", h15 > 0, h15, h15_std),
                ("5M MACD positive", m5 > 0, m5, m5_std),
                ("5M Histogram negative", h5 < 0, h5, h5_std),
            ]),
            ("30M Long Invalidation", [
                ("4H Histogram or MACD positive", (h4 > 0 or m4 > 0), h4, h4_std),
                ("1H MACD negative", m1 < 0, m1, m1_std),
                ("1H Histogram positive", h1 > 0, h1, h1_std),
                ("30M MACD positive", m30 > 0, m30, m30_std),
                ("30M Histogram positive", h30 > 0, h30, h30_std),
                ("15M MACD positive", m15 > 0, m15, m15_std),
                ("15M Histogram negative", h15 < 0, h15, h15_std),
                ("5M MACD negative", m5 < 0, m5, m5_std),
                ("5M Histogram negative", h5 < 0, h5, h5_std),
            ]),
            ("30M Short Invalidation", [
                ("4H Histogram or MACD negative", (h4 < 0 or m4 < 0), h4, h4_std),
                ("1H MACD positive", m1 > 0, m1, m1_std),
                ("1H Histogram negative", h1 < 0, h1, h1_std),
                ("30M MACD negative", m30 < 0, m30, m30_std),
                ("30M Histogram negative", h30 < 0, h30, h30_std),
                ("15M MACD negative", m15 < 0, m15, m15_std),
                ("15M Histogram positive", h15 > 0, h15, h15_std),
                ("5M MACD positive", m5 > 0, m5, m5_std),
                ("5M Histogram positive", h5 > 0, h5, h5_std),
            ]),
        ]

        # ======================
        # ALERTS (with price + time + bias, cooldown-protected)
        # ======================
        bias_line = f"Bias:\n12H {bias_emoji(h12)} | 4H {bias_emoji(h4)} | 1H {bias_emoji(h1)}"

        maybe_alert(
            "5m_hl", cond_5m_hl,
            f"🟢 BTC.P 5M Higher Low Setup\nPrice: {p5}\nTime: {now_str}\n\n{bias_line}",
            "5M Higher Low", volume
        )
        maybe_alert(
            "5m_lh", cond_5m_lh,
            f"🔴 BTC.P 5M Lower High Setup\nPrice: {p5}\nTime: {now_str}\n\n{bias_line}",
            "5M Lower High", volume
        )
        maybe_alert(
            "15m_hl", cond_15m_hl,
            f"🟢 BTC.P 15M Higher Low Setup\nPrice: {p15}\nTime: {now_str}\n\n{bias_line}",
            "15M Higher Low", volume
        )
        maybe_alert(
            "15m_lh", cond_15m_lh,
            f"🔴 BTC.P 15M Lower High Setup\nPrice: {p15}\nTime: {now_str}\n\n{bias_line}",
            "15M Lower High", volume
        )
        maybe_alert(
            "30m_long", cond_30m_long,
            f"🟢 BTC.P Potential 30 Minute Long Invalidation Play\nPrice: {p30}\nTime: {now_str}\n\n{bias_line}",
            "30M Long Invalidation", volume
        )
        maybe_alert(
            "30m_short", cond_30m_short,
            f"🔴 BTC.P Potential 30 Minute Short Invalidation Play\nPrice: {p30}\nTime: {now_str}\n\n{bias_line}",
            "30M Short Invalidation", volume
        )

        logging.info(
            f"5M HL:{cond_5m_hl} | 5M LH:{cond_5m_lh} | "
            f"15M HL:{cond_15m_hl} | 15M LH:{cond_15m_lh} | "
            f"30M LONG:{cond_30m_long} | 30M SHORT:{cond_30m_short}"
        )

        # ======================
        # SUPABASE PUSH (every cycle, so the dashboard's Trade Alerts
        # page always reflects the current state, not just every 2h)
        # ======================
        best_name, met, unmet, total = compute_closest_setup(setup_confluence)
        push_signals_to_supabase([{
            "symbol": "BTC",
            "category": "bitcoin",
            "setup": best_name,
            "last_setup": format_last_setup(),
            "volume": volume,
            "tradingview_url": BTC_TRADINGVIEW_URL,
            "market_bias": {
                "12H": "green" if h12 > 0 else "red",
                "4H": "green" if h4 > 0 else "red",
                "1H": "green" if h1 > 0 else "red",
            },
            "closest_setup": f"{best_name} ({len(met)}/{total} Confluence Met)",
            "confluence_met": met,
            "confluence_not_met": unmet,
            "heartbeat_at": datetime.now(timezone.utc).isoformat(),
        }])

        # ======================
        # HEARTBEAT (every 2 hours, skipped during quiet hours)
        # ======================
        now_ts = time.time()
        if SEND_TELEGRAM_HEARTBEAT and (now_ts - last_heartbeat["time"]) >= HEARTBEAT_INTERVAL_SECONDS:
            if in_quiet_hours():
                logging.info("Heartbeat due but skipped (quiet hours).")
            else:
                send_heartbeat(h12, h4, h1, setup_confluence)
            last_heartbeat["time"] = now_ts

        # ======================
        # DAILY SUMMARY (once a day at 8:00 AM UAE time)
        # ======================
        now_uae = datetime.now(UAE_TZ)
        if SEND_TELEGRAM_STATUS and now_uae.hour >= DAILY_SUMMARY_HOUR and last_daily_summary_date["date"] != now_uae.date():
            send_daily_summary()
            last_daily_summary_date["date"] = now_uae.date()

    except Exception as e:
        logging.error(f"ERROR (main loop): {e}")

    # Align next wake-up to the next 5-minute candle close (approx),
    # but never sleep longer than CANDLE_SECONDS or less than 5s.
    sleep_for = CANDLE_SECONDS - (time.time() % CANDLE_SECONDS)
    sleep_for = max(5, min(sleep_for, CANDLE_SECONDS))
    time.sleep(sleep_for)