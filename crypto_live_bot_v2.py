# crypto_live_bot_v2.py: alts alerts, four setups (2026-10-16).
#   15M Higher Low / Lower High: the 5M MACD+histogram replaces the 3M.
#   30M Long / Short Invalidation: 1H needs only the histogram colour
#   (green long, red short); the 5M replaces the 3M.
#   Cooldowns and 12-7 AM silence as in the BTC bot.
#   5M and 1H setups removed. BTC is not scanned (btc_live_bot_v2.py does it).
#   Secrets are in bot_secrets.py (gitignored); this file is safe to commit.
import html
import os
import json
import time
import logging
import requests
import pandas as pd
import ccxt
from datetime import datetime, timezone, timedelta
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

# ==========================
# CONFIG
# ==========================
# Secrets live in bot_secrets.py (gitignored, never committed).
import bot_secrets
BOT_TOKEN = bot_secrets.ALTS_BOT_TOKEN
CHAT_ID = bot_secrets.ALTS_CHAT_ID
if "PASTE_YOUR" in BOT_TOKEN or "PASTE_YOUR" in CHAT_ID:
    raise SystemExit(
        "ERROR: You still need to edit this file and replace "
        "BOT_TOKEN and CHAT_ID above with your real values."
    )

# Supabase — writes each coin's live state so the web dashboard's Trade
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

TV_EXCHANGE_MAP = {"binance": "BINANCE", "okx": "OKX", "bybit": "BYBIT", "bitget": "BITGET"}

REQUEST_TIMEOUT = 10
ALERT_COOLDOWN_SECONDS = 300       # don't re-fire same alert (per coin+setup) within this window
ERROR_ALERT_THRESHOLD = 10         # send a Telegram alert after this many consecutive failed cycles
MAX_WORKERS = 16                   # threads can run freely now — the per-exchange lock above prevents rate-limit issues regardless of this number

# Heartbeat / quiet hours config
UAE_OFFSET = timedelta(hours=4)
UAE_TZ = timezone(UAE_OFFSET)
HEARTBEAT_INTERVAL_SECONDS = 2 * 60 * 60   # every 2 hours
# The Telegram heartbeat message is off (2026-10-16). Set True to bring it back.
SEND_TELEGRAM_HEARTBEAT = False
# Telegram carries setup alerts only (2026-10-16): no startup message, no
# daily summary, no "failed N cycles" warning. A dead or stuck bot is caught
# by the app's offline push instead. Set True to bring them back.
SEND_TELEGRAM_STATUS = False
QUIET_START_HOUR = 0
QUIET_END_HOUR = 7
QUIET_END_MINUTE = 30
DAILY_SUMMARY_HOUR = 8

CYCLE_SLEEP_SECONDS = 300   # target time between full scans of all coins

LOG_DIR = r"C:\Users\Lenovo\Documents\BTC_BOT"
LOG_PATH = os.path.join(LOG_DIR, "crypto_bot_v2.log")

# ==========================
# COIN LIST (Exchange, Symbol)
# ==========================
COINS = [
    # BTC is watched by btc_live_bot.py only — listing it here too sent every
    # BTC setup twice (as "BTC" and "BTCUSDT.P"). Removed 2026-10-12.
    ("okx", "ETHUSDT.P"), ("okx", "SOLUSDT.P"),
    ("okx", "DOGEUSDT.P"), ("okx", "XRPUSDT.P"), ("binance", "VETUSDT.P"),
    ("binance", "JASMYUSDT.P"), ("binance", "KASUSDT.P"), ("okx", "HYPEUSDT.P"),
    ("okx", "ZECUSDT.P"), ("okx", "WLDUSDT.P"), ("binance", "FETUSDT.P"),
    ("okx", "XLMUSDT.P"), ("binance", "KAIAUSDT.P"), ("okx", "SUIUSDT.P"),
    ("binance", "DEEPUSDT.P"), ("okx", "PEPEUSDT.P"), ("okx", "ORDIUSDT.P"),
    ("okx", "AAVEUSDT.P"), ("okx", "ADAUSDT.P"), ("okx", "BNBUSDT.P"),
    ("okx", "PUMPUSDT.P"), ("okx", "LINKUSDT.P"), ("okx", "NEARUSDT.P"),
    ("okx", "JTOUSDT.P"), ("okx", "CHZUSDT.P"), ("okx", "FILUSDT.P"),
    ("okx", "BCHUSDT.P"), ("okx", "UNIUSDT.P"), ("okx", "LTCUSDT.P"),
    ("okx", "ENAUSDT.P"), ("okx", "AVAXUSDT.P"), ("okx", "TRUMPUSDT.P"),
    ("okx", "TRXUSDT.P"), ("bybit", "MNTUSDT.P"), ("okx", "ONDOUSDT.P"),
    ("okx", "TAOUSDT.P"), ("okx", "DOTUSDT.P"), ("okx", "WIFUSDT.P"),
    ("okx", "SHIBUSDT.P"), ("okx", "KAITOUSDT.P"), ("okx", "OPUSDT.P"),
    ("okx", "APTUSDT.P"), ("okx", "AXSUSDT.P"), ("okx", "SUSDT.P"),
    ("okx", "PENGUUSDT.P"), ("okx", "ASTERUSDT.P"), ("okx", "FARTCOINUSDT.P"),
    ("okx", "DYDXUSDT.P"), ("okx", "TIAUSDT.P"), ("okx", "INJUSDT.P"),
    ("okx", "ETCUSDT.P"), ("binance", "RUNEUSDT.P"), ("okx", "ARBUSDT.P"),
    ("okx", "ICPUSDT.P"), ("okx", "RENDERUSDT.P"), ("okx", "GALAUSDT.P"),
    ("okx", "HBARUSDT.P"), ("okx", "IPUSDT.P"), ("okx", "EIGENUSDT.P"),
    ("okx", "GRASSUSDT.P"), ("okx", "BONKUSDT.P"), ("okx", "SANDUSDT.P"),
    ("okx", "JUPUSDT.P"), ("okx", "ALGOUSDT.P"), ("okx", "ZROUSDT.P"),
    ("okx", "STRKUSDT.P"), ("okx", "POLUSDT.P"), ("okx", "ATOMUSDT.P"),
    ("binance", "CAKEUSDT.P"), ("okx", "CRVUSDT.P"), ("okx", "DASHUSDT.P"),
    ("okx", "AEROUSDT.P"), ("okx", "SEIUSDT.P"), ("okx", "VIRTUALUSDT.P"),
    ("okx", "MORPHOUSDT.P"), ("okx", "LDOUSDT.P"), ("okx", "PYTHUSDT.P"),
    ("okx", "PENDLEUSDT.P"), ("okx", "SKYUSDT.P"), ("okx", "TURBOUSDT.P"),
    ("okx", "BERAUSDT.P"), ("okx", "PNUTUSDT.P"), ("okx", "LINEAUSDT.P"),
    ("okx", "IOTAUSDT.P"), ("okx", "MOVEUSDT.P"), ("okx", "STXUSDT.P"),
    ("okx", "MANAUSDT.P"), ("okx", "FLOKIUSDT.P"), ("bitget", "BGBUSDT.P"),
    ("okx", "ENSUSDT.P"), ("binance", "DEXEUSDT.P"), ("okx", "GRTUSDT.P"),
    ("okx", "CROUSDT.P"), ("okx", "POPCATUSDT.P"), ("okx", "XTZUSDT.P"),
    ("okx", "RAYUSDT.P"), ("okx", "IMXUSDT.P"), ("okx", "QNTUSDT.P"),
    ("binance", "BSVUSDT.P"), ("okx", "WALUSDT.P"), ("okx", "BRETTUSDT.P"),
    ("binance", "XMRUSDT.P"),
]

TIMEFRAMES = ["12h", "4h", "1h", "30m", "15m", "5m"]
SYMBOL_EXCHANGE = dict(COINS)  # raw_symbol -> exchange_id, for TradingView links

# ==========================
# LOGGING SETUP
# ==========================
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    filename=LOG_PATH,
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s"
)
console = logging.StreamHandler()
console.setLevel(logging.INFO)
console.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
logging.getLogger().addHandler(console)

logging.info("Crypto multi-coin bot script started.")

# ==========================
# EXCHANGE CLIENTS
# One instance per exchange is reused across all coins and threads.
# ccxt clients are generally thread-safe for read-only calls like this.
# ==========================
EXCHANGES = {
    "binance": ccxt.binance({"enableRateLimit": True, "options": {"defaultType": "future"}}),
    "okx": ccxt.okx({"enableRateLimit": True, "options": {"defaultType": "swap"}}),
    "bybit": ccxt.bybit({"enableRateLimit": True, "options": {"defaultType": "swap"}}),
    "bitget": ccxt.bitget({"enableRateLimit": True, "options": {"defaultType": "swap"}}),
}
# enableRateLimit=True makes ccxt automatically throttle requests per-exchange
# to stay under each exchange's published limits — this is the main safety net.

# ccxt's built-in rate limiter only works reliably for sequential calls on
# one thread. Since we run multiple coins in parallel, we add our own
# per-exchange lock + minimum interval so threads hitting the SAME exchange
# take turns, while different exchanges can still run fully in parallel.
EXCHANGE_MIN_INTERVAL = {
    "binance": 0.08,
    "okx": 0.15,     # OKX has tighter public-endpoint limits, so slow this one down more
    "bybit": 0.08,
    "bitget": 0.08,
}
_exchange_locks = {ex: threading.Lock() for ex in EXCHANGES}
_exchange_last_call = {ex: 0.0 for ex in EXCHANGES}


def rate_limited_call(exchange_id, func, *args, **kwargs):
    lock = _exchange_locks[exchange_id]
    min_interval = EXCHANGE_MIN_INTERVAL.get(exchange_id, 0.1)
    with lock:
        elapsed = time.time() - _exchange_last_call[exchange_id]
        if elapsed < min_interval:
            time.sleep(min_interval - elapsed)
        result = func(*args, **kwargs)
        _exchange_last_call[exchange_id] = time.time()
        return result


def to_ccxt_symbol(raw_symbol):
    base = raw_symbol.replace(".P", "").replace("USDT", "")
    return f"{base}/USDT:USDT"


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


def insert_signal_alerts(rows):
    """Bulk-inserts one row per fired alert into signal_alerts (a real
    history log), instead of overwriting a single per-symbol row like
    push_signals_to_supabase does. Mirrors btc_live_bot.py's
    insert_signal_alert, but batched since many coins can fire per cycle."""
    if not rows:
        return
    url = f"{SUPABASE_URL}/rest/v1/signal_alerts"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
    try:
        resp = requests.post(url, headers=headers, json=rows, timeout=REQUEST_TIMEOUT)
        if resp.status_code >= 300:
            logging.error(f"SUPABASE ALERT INSERT ERROR: {resp.status_code} {resp.text[:300]}")
    except Exception as e:
        logging.error(f"SUPABASE ALERT INSERT FAILED: {e}")


def tradingview_url(exchange_id, raw_symbol):
    tv_ex = TV_EXCHANGE_MAP.get(exchange_id, exchange_id.upper())
    return f"https://www.tradingview.com/chart/?symbol={tv_ex}%3A{raw_symbol}"


def compute_closest_setup(confluence):
    """confluence: dict of setup_name -> [(label, ok, value, std), ...]"""
    best_name, best_checks = max(
        confluence.items(),
        key=lambda x: sum(1 for _, ok, *_ in x[1] if ok) / len(x[1])
    )
    met = [label for label, ok, *_ in best_checks if ok]
    unmet = [
        {"condition": label, "note": proximity_words(value, std)}
        for label, ok, value, std in best_checks if not ok
    ]
    return best_name, met, unmet, len(best_checks)


def format_last_setup_for(raw_symbol):
    entry = last_setup.get(raw_symbol)
    if not entry:
        return "None yet since bot started"
    elapsed = time.time() - entry["time"]
    hours = int(elapsed // 3600)
    minutes = int((elapsed % 3600) // 60)
    ago = f"{hours}h {minutes}m ago" if hours > 0 else f"{minutes}m ago"
    return f"{entry['name']} ({ago})"


def send_long(msg, max_len=3800):
    """Telegram caps messages around 4096 chars. Split long messages on
    blank-line boundaries so we don't cut a setup block in half."""
    if len(msg) <= max_len:
        send(msg)
        return
    parts = msg.split("\n\n")
    chunk = ""
    for part in parts:
        if len(chunk) + len(part) + 2 > max_len:
            send(chunk)
            chunk = part
        else:
            chunk = f"{chunk}\n\n{part}" if chunk else part
    if chunk:
        send(chunk)


# ==========================
# MACD CALCULATION
# ==========================
def get_macd(closes):
    s = pd.Series(closes)
    ema_fast = s.ewm(span=12, adjust=False).mean()
    ema_slow = s.ewm(span=26, adjust=False).mean()
    macd = ema_fast - ema_slow
    signal = macd.ewm(span=9, adjust=False).mean()
    hist = macd - signal
    return macd, hist


def last(series):
    return series.iloc[-2]


def fetch_macd_hist(exchange, exchange_id, symbol, tf):
    try:
        ohlcv = rate_limited_call(exchange_id, exchange.fetch_ohlcv, symbol, timeframe=tf, limit=200)
        closes = [c[4] for c in ohlcv]
        price = closes[-2]
        macd, hist = get_macd(closes)
        macd_std = macd.iloc[-22:-2].std()
        hist_std = hist.iloc[-22:-2].std()
        return last(macd), last(hist), price, macd_std, hist_std
    except Exception as e:
        logging.error(f"ERROR fetching {symbol} {tf}: {e}")
        return None, None, None, None, None


def fetch_volume_usd(exchange, exchange_id, symbol):
    try:
        ticker = rate_limited_call(exchange_id, exchange.fetch_ticker, symbol)
        vol = ticker.get("quoteVolume")
        return vol
    except Exception as e:
        logging.error(f"ERROR fetching volume {symbol}: {e}")
        return None


def format_volume(vol):
    if vol is None:
        return "Unavailable"
    if vol >= 1_000_000_000:
        return f"${vol / 1_000_000_000:.2f}B"
    if vol >= 1_000_000:
        return f"${vol / 1_000_000:.1f}M"
    if vol >= 1_000:
        return f"${vol / 1_000:.1f}K"
    return f"${vol:.0f}"


def bias_emoji(value):
    if value is None:
        return "⚪"
    return "🟢" if value > 0 else "🔴"


def proximity_words(value, std):
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


def in_quiet_hours():
    now_uae = datetime.now(UAE_TZ)
    start = now_uae.replace(hour=QUIET_START_HOUR, minute=0, second=0, microsecond=0)
    end = now_uae.replace(hour=QUIET_END_HOUR, minute=QUIET_END_MINUTE, second=0, microsecond=0)
    return start <= now_uae < end


# ==========================
# CONFLUENCE LOGIC (same rules as the BTC bot, reused per coin)
# ==========================
def evaluate_setups(d):
    m12, h12 = d["12h"]["macd"], d["12h"]["hist"]
    m4, h4 = d["4h"]["macd"], d["4h"]["hist"]
    m1, h1 = d["1h"]["macd"], d["1h"]["hist"]
    m30, h30 = d["30m"]["macd"], d["30m"]["hist"]
    m15, h15 = d["15m"]["macd"], d["15m"]["hist"]
    m5, h5 = d["5m"]["macd"], d["5m"]["hist"]

    conditions = {
        # 30M must be in bull territory with a green histogram (2026-10-16).
        "15M Higher Low": (h4 > 0 and h1 > 0 and m1 > 0 and m30 > 0 and h30 > 0 and h15 < 0 and m15 > 0 and h5 > 0 and m5 < 0),
        "15M Lower High": (h4 < 0 and h1 < 0 and m1 < 0 and m30 < 0 and h30 < 0 and h15 > 0 and m15 < 0 and h5 < 0 and m5 > 0),
        # 30M Invalidation: 1H MACD on the far side of zero with the histogram turned (as in the Playbook), so it never fires together with 15M HL/LH.
        "30M Long Invalidation": ((h4 > 0 or m4 > 0) and m1 < 0 and h1 > 0 and h30 > 0 and m30 > 0 and h15 < 0 and m15 > 0 and h5 < 0 and m5 < 0),
        "30M Short Invalidation": ((h4 < 0 or m4 < 0) and m1 > 0 and h1 < 0 and h30 < 0 and m30 < 0 and h15 > 0 and m15 < 0 and h5 > 0 and m5 > 0),
    }

    confluence = {
        "15M Higher Low": [
            ("4H Histogram positive", h4 > 0, h4, d["4h"]["hist_std"]),
            ("1H MACD positive", m1 > 0, m1, d["1h"]["macd_std"]),
            ("1H Histogram positive", h1 > 0, h1, d["1h"]["hist_std"]),
            ("30M MACD positive", m30 > 0, m30, d["30m"]["macd_std"]),
            ("30M Histogram positive", h30 > 0, h30, d["30m"]["hist_std"]),
            ("15M MACD positive", m15 > 0, m15, d["15m"]["macd_std"]),
            ("15M Histogram negative", h15 < 0, h15, d["15m"]["hist_std"]),
            ("5M MACD negative", m5 < 0, m5, d["5m"]["macd_std"]),
            ("5M Histogram positive", h5 > 0, h5, d["5m"]["hist_std"]),
        ],
        "15M Lower High": [
            ("4H Histogram negative", h4 < 0, h4, d["4h"]["hist_std"]),
            ("1H MACD negative", m1 < 0, m1, d["1h"]["macd_std"]),
            ("1H Histogram negative", h1 < 0, h1, d["1h"]["hist_std"]),
            ("30M MACD negative", m30 < 0, m30, d["30m"]["macd_std"]),
            ("30M Histogram negative", h30 < 0, h30, d["30m"]["hist_std"]),
            ("15M MACD negative", m15 < 0, m15, d["15m"]["macd_std"]),
            ("15M Histogram positive", h15 > 0, h15, d["15m"]["hist_std"]),
            ("5M MACD positive", m5 > 0, m5, d["5m"]["macd_std"]),
            ("5M Histogram negative", h5 < 0, h5, d["5m"]["hist_std"]),
        ],
        "30M Long Invalidation": [
            ("4H Histogram or MACD positive", (h4 > 0 or m4 > 0), h4, d["4h"]["hist_std"]),
            ("1H MACD negative", m1 < 0, m1, d["1h"]["macd_std"]),
            ("1H Histogram positive", h1 > 0, h1, d["1h"]["hist_std"]),
            ("30M MACD positive", m30 > 0, m30, d["30m"]["macd_std"]),
            ("30M Histogram positive", h30 > 0, h30, d["30m"]["hist_std"]),
            ("15M MACD positive", m15 > 0, m15, d["15m"]["macd_std"]),
            ("15M Histogram negative", h15 < 0, h15, d["15m"]["hist_std"]),
            ("5M MACD negative", m5 < 0, m5, d["5m"]["macd_std"]),
            ("5M Histogram negative", h5 < 0, h5, d["5m"]["hist_std"]),
        ],
        "30M Short Invalidation": [
            ("4H Histogram or MACD negative", (h4 < 0 or m4 < 0), h4, d["4h"]["hist_std"]),
            ("1H MACD positive", m1 > 0, m1, d["1h"]["macd_std"]),
            ("1H Histogram negative", h1 < 0, h1, d["1h"]["hist_std"]),
            ("30M MACD negative", m30 < 0, m30, d["30m"]["macd_std"]),
            ("30M Histogram negative", h30 < 0, h30, d["30m"]["hist_std"]),
            ("15M MACD negative", m15 < 0, m15, d["15m"]["macd_std"]),
            ("15M Histogram positive", h15 > 0, h15, d["15m"]["hist_std"]),
            ("5M MACD positive", m5 > 0, m5, d["5m"]["macd_std"]),
            ("5M Histogram positive", h5 > 0, h5, d["5m"]["hist_std"]),
        ],
    }

    return conditions, confluence


SETUP_EMOJI = {
    "15M Higher Low": "🟢", "15M Lower High": "🔴",
    "30M Long Invalidation": "🟢", "30M Short Invalidation": "🔴",
}

# ==========================
# STATE
# ==========================
alert_state = {}     # (coin, setup_name) -> {"active": bool, "last_sent": ts}

# Same as the BTC bot (2026-10-17): a setup may not alert again for the same
# coin within its window, even if it flickers off and back on, and nothing is
# sent while the owner sleeps.
COOLDOWN_BY_SETUP = {
    "15M Higher Low": 60 * 60, "15M Lower High": 60 * 60,
    "30M Long Invalidation": 90 * 60, "30M Short Invalidation": 90 * 60,
}
ALERT_QUIET_START_HOUR = 0   # 12:00 AM UAE
ALERT_QUIET_END_HOUR = 7     # until 7:00 AM UAE


def in_alert_quiet_hours():
    h = datetime.now(UAE_TZ).hour
    return ALERT_QUIET_START_HOUR <= h < ALERT_QUIET_END_HOUR


# When each coin+setup last alerted, kept on disk so a restart does not
# re-send an alert that went out just before it.
LAST_SENT_PATH = os.path.join(LOG_DIR, "crypto_last_sent_v2.json")
_state_lock = threading.Lock()


def _load_last_sent():
    try:
        with open(LAST_SENT_PATH, "r", encoding="utf-8") as f:
            for k, ts in json.load(f).items():
                coin, _, setup = k.partition("|")
                alert_state[(coin, setup)] = {"active": False, "last_sent": float(ts)}
    except Exception:
        pass


def _save_last_sent():
    try:
        with _state_lock:
            data = {f"{c}|{s_}": v["last_sent"] for (c, s_), v in alert_state.items() if v["last_sent"]}
        with open(LAST_SENT_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f)
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
ALERT_COUNT_PATH = os.path.join(LOG_DIR, "crypto_alert_counts_v2.json")
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
last_setup = {}       # coin -> {"name":, "time":}
trigger_log = []      # (timestamp, coin, setup_name)


def get_alert_state(coin, setup_name):
    key = (coin, setup_name)
    with _state_lock:
        if key not in alert_state:
            alert_state[key] = {"active": False, "last_sent": 0}
        return alert_state[key]


# ==========================
# SCAN ONE COIN (runs inside a worker thread)
# ==========================
def scan_coin(exchange_id, raw_symbol):
    exchange = EXCHANGES[exchange_id]
    symbol = to_ccxt_symbol(raw_symbol)

    d = {}
    for tf in TIMEFRAMES:
        macd, hist, price, macd_std, hist_std = fetch_macd_hist(exchange, exchange_id, symbol, tf)
        d[tf] = {"macd": macd, "hist": hist, "price": price, "macd_std": macd_std, "hist_std": hist_std}

    if any(d[tf]["macd"] is None for tf in TIMEFRAMES):
        return raw_symbol, None

    volume = fetch_volume_usd(exchange, exchange_id, symbol)

    conditions, confluence = evaluate_setups(d)

    fired = []
    now = time.time()
    for setup_name, is_true in conditions.items():
        st = get_alert_state(raw_symbol, setup_name)
        if is_true and in_alert_quiet_hours():
            # Asleep: no alert, and marked active so it does not fire at 7 AM
            # for a setup that formed during the night.
            st["active"] = True
            continue
        if is_true:
            cooled_down = (now - st["last_sent"]) >= COOLDOWN_BY_SETUP.get(setup_name, ALERT_COOLDOWN_SECONDS)
            if not st["active"] and cooled_down:
                fired.append((setup_name, volume))
                st["last_sent"] = now
                last_setup[raw_symbol] = {"name": setup_name, "time": now}
                trigger_log.append((now, raw_symbol, setup_name))
            st["active"] = True
        else:
            st["active"] = False

    return raw_symbol, {"fired": fired, "d": d, "conditions": conditions, "confluence": confluence, "volume": volume}


# ==========================
# STARTUP ALERT
# ==========================
if SEND_TELEGRAM_STATUS:
    send(f"✅ Crypto Multi-Coin Alert Bot started\nMonitoring {len(COINS)} coins\nTime: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    logging.info("Startup Telegram alert sent.")
logging.info("Bot running (Telegram: setup alerts only).")


# ==========================
# MAIN LOOP
# ==========================
consecutive_errors = 0
error_alert_sent = False
last_heartbeat = {"time": 0}
last_alert_sent = {"time": 0}   # tracks the last time any setup alert was sent
last_daily_summary_date = {"date": None}

while True:
    cycle_start = time.time()
    try:
        all_results = {}
        batch_alerts = []
        alert_rows = []  # one row per fired setup, inserted into signal_alerts below

        # Scan all coins in parallel (ccxt's enableRateLimit handles
        # per-exchange throttling automatically, even across threads)
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
            futures = [pool.submit(scan_coin, ex_id, sym) for ex_id, sym in COINS]
            for future in as_completed(futures):
                raw_symbol, result = future.result()
                if result is None:
                    continue
                all_results[raw_symbol] = result
                for setup_name, volume in result["fired"]:
                    emoji = SETUP_EMOJI.get(setup_name, "🔔")
                    vol_str = format_volume(volume)
                    exchange_id = SYMBOL_EXCHANGE.get(raw_symbol, "binance")
                    tv = tradingview_url(exchange_id, raw_symbol)
                    d0 = result["d"]
                    price = d0["30m" if setup_name.startswith("30M") else "15m"]["price"]
                    # One message per alert, like BTC, with its own chart link.
                    line = (f"{emoji} {raw_symbol} {setup_name}\n"
                            f"{count_alert(raw_symbol, setup_name)}\n"
                            f"Price: {price}\n"
                            f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n"
                            f"Bias: 12H {bias_emoji(d0['12h']['hist'])} | 4H {bias_emoji(d0['4h']['hist'])} | 1H {bias_emoji(d0['1h']['hist'])}\n"
                            f"24H Volume: {vol_str}")
                    batch_alerts.append(html.escape(line)
                        + f'\n\n<a href="{tv}">Open {html.escape(raw_symbol)} chart on TradingView</a>')
                    category = "bitcoin" if raw_symbol.upper().startswith("BTC") else "altcoin"
                    alert_rows.append({
                        "symbol": raw_symbol,
                        "category": category,
                        "setup": setup_name,
                        "message": line,
                        "volume": volume,
                        "tradingview_url": tradingview_url(exchange_id, raw_symbol),
                        "alert_at": datetime.now(timezone.utc).isoformat(),
                    })

        insert_signal_alerts(alert_rows)

        if not all_results:
            consecutive_errors += 1
            logging.warning(f"All coin scans failed this cycle ({consecutive_errors}/{ERROR_ALERT_THRESHOLD})")
            if SEND_TELEGRAM_STATUS and consecutive_errors >= ERROR_ALERT_THRESHOLD and not error_alert_sent:
                send(f"⚠️ Crypto bot has failed {consecutive_errors} cycles in a row. Check the bot.")
                error_alert_sent = True
        else:
            consecutive_errors = 0
            error_alert_sent = False

        # ======================
        # SUPABASE PUSH (bulk, every cycle — trading_signals is the bot's
        # own "current state per coin" table, used for its own heartbeat /
        # closest-setup logic. The dashboard's Trade Alerts page reads
        # signal_alerts instead (inserted above), not this table.
        # ======================
        signal_rows = []
        for raw_symbol, result in all_results.items():
            exchange_id = SYMBOL_EXCHANGE.get(raw_symbol, "binance")
            d = result["d"]
            best_name, met, unmet, total = compute_closest_setup(result["confluence"])
            category = "bitcoin" if raw_symbol.upper().startswith("BTC") else "altcoin"
            signal_rows.append({
                "symbol": raw_symbol,
                "category": category,
                "setup": best_name,
                "last_setup": format_last_setup_for(raw_symbol),
                "volume": result["volume"],
                "tradingview_url": tradingview_url(exchange_id, raw_symbol),
                "market_bias": {
                    "12H": "green" if d["12h"]["hist"] > 0 else "red",
                    "4H": "green" if d["4h"]["hist"] > 0 else "red",
                    "1H": "green" if d["1h"]["hist"] > 0 else "red",
                },
                "closest_setup": f"{best_name} ({len(met)}/{total} Confluence Met)",
                "confluence_met": met,
                "confluence_not_met": unmet,
                "heartbeat_at": datetime.now(timezone.utc).isoformat(),
            })
        push_signals_to_supabase(signal_rows)

        # ======================
        # SEND BATCHED ALERTS
        # ======================
        if batch_alerts:
            # Individual messages; a short pause keeps Telegram from rate-limiting a burst.
            for i, tg in enumerate(batch_alerts):
                if i:
                    time.sleep(1.1)
                send(tg, html_mode=True)
            last_alert_sent["time"] = time.time()
            _save_last_sent()
            logging.info(f"Alerts sent: {len(batch_alerts)} setups triggered.")

        logging.info(f"Cycle complete: {len(all_results)}/{len(COINS)} coins scanned successfully.")

        # ======================
        # HEARTBEAT
        # Only sends if no setup alerts have been received in the last 2 hours.
        # If alerts are coming in, bot is clearly alive — no need for heartbeat.
        # ======================
        now_ts = time.time()
        no_alerts_for_2h = (now_ts - last_alert_sent["time"]) >= HEARTBEAT_INTERVAL_SECONDS
        heartbeat_due = (now_ts - last_heartbeat["time"]) >= HEARTBEAT_INTERVAL_SECONDS

        if SEND_TELEGRAM_HEARTBEAT and no_alerts_for_2h and heartbeat_due and all_results:
            if in_quiet_hours():
                logging.info("Heartbeat due but skipped (quiet hours).")
            else:
                almost = []
                for raw_symbol, result in all_results.items():
                    for setup_name, checks in result["confluence"].items():
                        unmet = [(label, val, std) for label, ok, val, std in checks if not ok]
                        if 0 < len(unmet) <= 2:
                            almost.append((raw_symbol, setup_name, unmet, result))

                now_str = datetime.now().strftime("%Y-%m-%d %H:%M")

                if almost:
                    blocks = []
                    for raw_symbol, setup_name, unmet, result in almost:
                        d = result["d"]
                        bias = (
                            f"12H {bias_emoji(d['12h']['hist'])} | "
                            f"4H {bias_emoji(d['4h']['hist'])} | "
                            f"1H {bias_emoji(d['1h']['hist'])}"
                        )
                        vol = format_volume(result["volume"])
                        unmet_lines = "\n".join(
                            f"❌ {label} — {proximity_words(val, std)}" for label, val, std in unmet
                        )
                        block = (
                            f"{raw_symbol} — {setup_name}\n"
                            f"Bias: {bias}\n"
                            f"24H Volume: {vol}\n"
                            f"{unmet_lines}"
                        )
                        blocks.append(block)
                    body = "\n\n".join(blocks)
                else:
                    body = f"No setups close to triggering right now across all {len(all_results)} coins."

                heartbeat_msg = (
                    f"🤖 Crypto Bot Heartbeat\n"
                    f"Time: {now_str}\n\n"
                    f"Almost Triggering (1-2 confluence left):\n\n{body}"
                )
                send_long(heartbeat_msg)
                logging.info("Heartbeat sent.")
            last_heartbeat["time"] = now_ts

        # ======================
        # DAILY SUMMARY (once a day at 8:00 AM UAE time)
        # ======================
        now_uae = datetime.now(UAE_TZ)
        if SEND_TELEGRAM_STATUS and now_uae.hour >= DAILY_SUMMARY_HOUR and last_daily_summary_date["date"] != now_uae.date():
            cutoff = time.time() - 24 * 60 * 60
            recent = [(coin, setup) for ts, coin, setup in trigger_log if ts >= cutoff]

            if not recent:
                body = "No setups triggered in the last 24 hours."
            else:
                counts = {}
                for coin, setup in recent:
                    counts[coin] = counts.get(coin, 0) + 1
                lines = [f"{coin}: {count}x" for coin, count in sorted(counts.items(), key=lambda x: -x[1])]
                triggered_coins = set(counts.keys())
                no_setup_coins = [raw for _, raw in COINS if raw not in triggered_coins]
                body = "\n".join(lines)
                if no_setup_coins:
                    body += "\n\nNo setups: " + ", ".join(c.replace("USDT.P", "") for c in no_setup_coins)

            now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
            send_long(f"📊 Crypto Daily Summary (last 24h)\nTime: {now_str}\n\n{body}")
            logging.info("Daily summary sent.")
            last_daily_summary_date["date"] = now_uae.date()

            trigger_log[:] = [(ts, c, s) for ts, c, s in trigger_log if ts >= cutoff]

    except Exception as e:
        logging.error(f"ERROR (main loop): {e}")

    elapsed = time.time() - cycle_start
    sleep_for = max(5, CYCLE_SLEEP_SECONDS - elapsed)
    logging.info(f"Cycle took {elapsed:.0f}s. Sleeping {sleep_for:.0f}s.")
    time.sleep(sleep_for)