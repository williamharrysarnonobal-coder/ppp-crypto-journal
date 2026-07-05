/**
 * BTC.P MTF Alert Bot — Google Apps Script port of btc_live_bot.py
 *
 * DEPLOY:
 * 1. Go to https://script.google.com/ -> New project.
 * 2. Paste this whole file in as Code.gs (or add as a new script file).
 * 3. Project Settings (gear icon) -> Script Properties -> add:
 *      BOT_TOKEN              (Telegram bot token)
 *      CHAT_ID                (Telegram chat id)
 *      SUPABASE_SERVICE_KEY   (Supabase service_role secret key)
 *    Never hardcode these in the script itself.
 * 4. Run `runBtcBot` once manually (Triggers require it to run once first
 *    so Google can ask you to authorize external requests).
 * 5. Triggers (clock icon, left sidebar) -> Add Trigger:
 *      Function: runBtcBot
 *      Event source: Time-driven
 *      Type: Minutes timer -> Every 5 minutes
 *
 * Unlike the Python version's `while True` loop, this runs ONE pass per
 * call — the time-driven trigger is what gives it its "every 5 minutes"
 * cadence instead of an internal time.sleep(). State that used to live in
 * plain Python variables for the life of the process (cooldowns, last
 * setup, daily summary tracking, heartbeat timer, error counter) is saved
 * to/loaded from PropertiesService between runs instead.
 */

// ==========================
// CONFIG
// ==========================
var SUPABASE_URL = "https://ofohjebtyppsxgjuqxme.supabase.co";
var SUPABASE_TABLE = "trading_signals";
var SYMBOL = "BTCUSDT"; // USDT-M Perpetual (BTCUSDT.P)
var BINANCE_FUTURES_KLINES_URL = "https://fapi.binance.com/fapi/v1/klines";
var BINANCE_FUTURES_TICKER_URL = "https://fapi.binance.com/fapi/v1/ticker/24hr";
var REQUEST_TIMEOUT_MS = 10000;
var ALERT_COOLDOWN_SECONDS = 300; // don't re-fire same alert within this window
var ERROR_ALERT_THRESHOLD = 10;   // send a Telegram alert after this many consecutive failures

// Heartbeat / quiet hours config
var UAE_OFFSET_HOURS = 4; // UAE is UTC+4, no DST
var HEARTBEAT_INTERVAL_SECONDS = 2 * 60 * 60; // every 2 hours
var QUIET_START_HOUR = 0;   // 12:00 AM UAE time
var QUIET_END_HOUR = 7;     // quiet until 7:30 AM UAE time
var QUIET_END_MINUTE = 30;
var DAILY_SUMMARY_HOUR = 8; // send once-a-day setup summary at 8:00 AM UAE time

var BTC_TRADINGVIEW_URL = "https://www.tradingview.com/chart/?symbol=BINANCE%3ABTCUSDT.P";

var STATE_KEYS = ["5m_hl", "5m_lh", "15m_hl", "15m_lh", "30m_long", "30m_short", "1h_hl", "1h_lh"];

function getSecret_(name) {
  var v = PropertiesService.getScriptProperties().getProperty(name);
  if (!v) throw new Error("Missing Script Property: " + name + " — set it in Project Settings > Script Properties.");
  return v;
}

// ==========================
// STATE (PropertiesService instead of in-memory globals)
// ==========================
function loadState_() {
  var raw = PropertiesService.getScriptProperties().getProperty("BOT_STATE");
  var defaults = {
    setups: {}, // key -> {active, lastSent}
    lastSetupName: null,
    lastSetupTime: null,
    triggerLog: [], // [{ts, name}]
    lastHeartbeat: 0,
    lastDailySummaryDate: null, // "YYYY-MM-DD" in UAE time
    consecutiveErrors: 0,
    errorAlertSent: false
  };
  if (!raw) return defaults;
  try {
    var parsed = JSON.parse(raw);
    for (var k in defaults) if (!(k in parsed)) parsed[k] = defaults[k];
    return parsed;
  } catch (e) {
    return defaults;
  }
}

function saveState_(state) {
  PropertiesService.getScriptProperties().setProperty("BOT_STATE", JSON.stringify(state));
}

// ==========================
// TELEGRAM
// ==========================
function sendTelegram_(msg) {
  var botToken = getSecret_("BOT_TOKEN");
  var chatId = getSecret_("CHAT_ID");
  var url = "https://api.telegram.org/bot" + botToken + "/sendMessage";
  try {
    var resp = UrlFetchApp.fetch(url, {
      method: "post",
      payload: { chat_id: chatId, text: msg },
      muteHttpExceptions: true
    });
    var data = JSON.parse(resp.getContentText());
    if (!data.ok) Logger.log("TELEGRAM ERROR: " + resp.getContentText());
  } catch (e) {
    Logger.log("TELEGRAM SEND FAILED: " + e);
  }
}

// ==========================
// SUPABASE
// ==========================
function pushSignalsToSupabase_(rows) {
  if (!rows || !rows.length) return;
  var url = SUPABASE_URL + "/rest/v1/" + SUPABASE_TABLE + "?on_conflict=symbol";
  var key = getSecret_("SUPABASE_SERVICE_KEY");
  try {
    var resp = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: {
        apikey: key,
        Authorization: "Bearer " + key,
        Prefer: "resolution=merge-duplicates"
      },
      payload: JSON.stringify(rows),
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() >= 300) {
      Logger.log("SUPABASE ERROR: " + resp.getResponseCode() + " " + resp.getContentText().slice(0, 300));
    }
  } catch (e) {
    Logger.log("SUPABASE PUSH FAILED: " + e);
  }
}

function insertSignalAlert_(row) {
  var url = SUPABASE_URL + "/rest/v1/signal_alerts";
  var key = getSecret_("SUPABASE_SERVICE_KEY");
  try {
    var resp = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: {
        apikey: key,
        Authorization: "Bearer " + key,
        Prefer: "return=minimal"
      },
      payload: JSON.stringify([row]),
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() >= 300) {
      Logger.log("SUPABASE ALERT INSERT ERROR: " + resp.getResponseCode() + " " + resp.getContentText().slice(0, 300));
    }
  } catch (e) {
    Logger.log("SUPABASE ALERT INSERT FAILED: " + e);
  }
}

// ==========================
// BINANCE DATA (USDT-M PERPETUAL FUTURES)
// ==========================
function fetchBtcVolume_() {
  try {
    var resp = UrlFetchApp.fetch(BINANCE_FUTURES_TICKER_URL + "?symbol=" + SYMBOL, { muteHttpExceptions: true });
    var data = JSON.parse(resp.getContentText());
    return data.quoteVolume !== undefined ? parseFloat(data.quoteVolume) : null;
  } catch (e) {
    Logger.log("ERROR fetching volume: " + e);
    return null;
  }
}

function getCloses_(tf) {
  var url = BINANCE_FUTURES_KLINES_URL + "?symbol=" + SYMBOL + "&interval=" + tf + "&limit=200";
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var klines = JSON.parse(resp.getContentText());
  if (!Array.isArray(klines)) {
    Logger.log("BINANCE NON-ARRAY RESPONSE for " + tf + " (HTTP " + resp.getResponseCode() + "): " + resp.getContentText().slice(0, 500));
    throw new Error("Binance did not return kline data — see log above for the raw response.");
  }
  // Each kline: [open_time, open, high, low, close, volume, close_time, ...]
  return klines.map(function (k) { return parseFloat(k[4]); });
}

// ==========================
// EMA / MACD (replicates pandas' .ewm(span=N, adjust=False).mean())
// ==========================
function ema_(values, span) {
  var alpha = 2 / (span + 1);
  var out = new Array(values.length);
  out[0] = values[0];
  for (var i = 1; i < values.length; i++) {
    out[i] = alpha * values[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

function stdev_(values) {
  var n = values.length;
  if (n === 0) return 0;
  var mean = values.reduce(function (a, b) { return a + b; }, 0) / n;
  var variance = values.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / n;
  return Math.sqrt(variance);
}

// Returns {macd, hist, price, macdStd, histStd} for one timeframe — same
// shape/semantics as Python's fetch_macd_hist(). `last()` in the Python
// version reads iloc[-2] (the last CLOSED candle, since the newest one is
// still forming), so we mirror that with index length-2 here too.
function fetchMacdHist_(tf) {
  try {
    var closes = getCloses_(tf);
    var emaFast = ema_(closes, 12);
    var emaSlow = ema_(closes, 26);
    var macd = emaFast.map(function (v, i) { return v - emaSlow[i]; });
    var signal = ema_(macd, 9);
    var hist = macd.map(function (v, i) { return v - signal[i]; });

    var idx = closes.length - 2;
    var price = closes[idx];
    var macdRecent = macd.slice(closes.length - 22, closes.length - 2);
    var histRecent = hist.slice(closes.length - 22, closes.length - 2);

    return {
      macd: macd[idx],
      hist: hist[idx],
      price: price,
      macdStd: stdev_(macdRecent),
      histStd: stdev_(histRecent)
    };
  } catch (e) {
    Logger.log("ERROR fetching " + tf + ": " + e);
    return { macd: null, hist: null, price: null, macdStd: null, histStd: null };
  }
}

// ==========================
// ALERT STATE (DEDUP + COOLDOWN)
// ==========================
function maybeAlert_(state, key, condition, message, displayName, volume, nowSec) {
  if (!state.setups[key]) state.setups[key] = { active: false, lastSent: 0 };
  var s = state.setups[key];

  if (condition) {
    var cooledDown = (nowSec - s.lastSent) >= ALERT_COOLDOWN_SECONDS;
    if (!s.active && cooledDown) {
      sendTelegram_(message + "\n\n📊 Check Trading Alerts");
      Logger.log("ALERT SENT [" + key + "]: " + message);
      s.lastSent = nowSec;
      state.lastSetupName = displayName;
      state.lastSetupTime = nowSec;
      state.triggerLog.push({ ts: nowSec, name: displayName });
      insertSignalAlert_({
        symbol: "BTC",
        category: "bitcoin",
        setup: displayName,
        message: message,
        volume: volume,
        tradingview_url: BTC_TRADINGVIEW_URL,
        alert_at: new Date().toISOString()
      });
    }
    s.active = true;
  } else {
    s.active = false;
  }
}

function formatLastSetup_(state, nowSec) {
  if (!state.lastSetupName) return "None yet since bot started";
  var elapsed = nowSec - state.lastSetupTime;
  var hours = Math.floor(elapsed / 3600);
  var minutes = Math.floor((elapsed % 3600) / 60);
  var ago = hours > 0 ? (hours + "h " + minutes + "m ago") : (minutes + "m ago");
  return state.lastSetupName + " (" + ago + ")";
}

function biasEmoji_(value) {
  return value > 0 ? "🟢" : "🔴";
}

function proximityWords_(value, std) {
  if (value === null || std === null || std === 0) return "unclear";
  var ratio = Math.abs(value) / std;
  if (ratio < 0.25) return "very close to flipping";
  if (ratio < 0.6) return "getting close";
  if (ratio < 1.2) return "moderate distance";
  return "far from flipping";
}

// setupConfluence: [ [name, [ [label, ok, value, std], ... ] ], ... ]
function computeClosestSetup_(setupConfluence) {
  var best = null;
  var bestRatio = -1;
  setupConfluence.forEach(function (entry) {
    var checks = entry[1];
    var met = checks.filter(function (c) { return c[1]; }).length;
    var ratio = met / checks.length;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = entry;
    }
  });
  var bestName = best[0];
  var bestChecks = best[1];
  var met = bestChecks.filter(function (c) { return c[1]; }).map(function (c) { return c[0]; });
  var unmet = bestChecks.filter(function (c) { return !c[1]; }).map(function (c) {
    return { condition: c[0], note: proximityWords_(c[2], c[3]) };
  });
  return { bestName: bestName, met: met, unmet: unmet, total: bestChecks.length };
}

function sendDailySummary_(state, nowSec) {
  var cutoff = nowSec - 24 * 60 * 60;
  var recent = state.triggerLog.filter(function (t) { return t.ts >= cutoff; }).map(function (t) { return t.name; });

  var body;
  if (!recent.length) {
    body = "No setups triggered in the last 24 hours.";
  } else {
    var counts = {};
    recent.forEach(function (name) { counts[name] = (counts[name] || 0) + 1; });
    var lines = Object.keys(counts)
      .sort(function (a, b) { return counts[b] - counts[a]; })
      .map(function (name) { return name + ": " + counts[name] + "x"; });
    body = lines.join("\n");
  }

  var nowStr = Utilities.formatDate(new Date(), "GMT+4", "yyyy-MM-dd HH:mm");
  var msg = "📊 BTC.P Daily Summary (last 24h)\nTime: " + nowStr + "\n\n" + body;
  sendTelegram_(msg);
  Logger.log("Daily summary sent.");

  state.triggerLog = state.triggerLog.filter(function (t) { return t.ts >= cutoff; });
}

function inQuietHours_(uaeHour, uaeMinute) {
  var startMin = QUIET_START_HOUR * 60;
  var endMin = QUIET_END_HOUR * 60 + QUIET_END_MINUTE;
  var nowMin = uaeHour * 60 + uaeMinute;
  return nowMin >= startMin && nowMin < endMin;
}

function sendHeartbeat_(state, h12, h4, h1, setupConfluence, nowSec) {
  var nowStr = Utilities.formatDate(new Date(), "GMT+4", "yyyy-MM-dd HH:mm");
  var biasLine = "12H " + biasEmoji_(h12) + " | 4H " + biasEmoji_(h4) + " | 1H " + biasEmoji_(h1);
  var closest = computeClosestSetup_(setupConfluence);

  var metLines = closest.met.length ? closest.met.map(function (l) { return "✅ " + l; }).join("\n") : "—";
  var unmetLines = closest.unmet.length
    ? closest.unmet.map(function (u) { return "❌ " + u.condition + " — " + u.note; }).join("\n")
    : "—";

  var msg = "🤖 BTC.P Bot Heartbeat\n" +
    "Time: " + nowStr + "\n\n" +
    "Last Setup: " + formatLastSetup_(state, nowSec) + "\n\n" +
    "Market Bias:\n" + biasLine + "\n\n" +
    "Closest to Triggering: " + closest.bestName + " (" + closest.met.length + "/" + closest.total + " Confluence Met)\n\n" +
    "Met:\n" + metLines + "\n\n" +
    "Not Met:\n" + unmetLines;
  sendTelegram_(msg);
  Logger.log("Heartbeat sent.");
}

// ==========================
// MAIN — call this from a time-driven trigger, every 5 minutes
// ==========================
function runBtcBot() {
  var state = loadState_();
  var nowSec = Math.floor(Date.now() / 1000);

  try {
    var tf12 = fetchMacdHist_("12h");
    var tf4 = fetchMacdHist_("4h");
    var tf1 = fetchMacdHist_("1h");
    var tf30 = fetchMacdHist_("30m");
    var tf15 = fetchMacdHist_("15m");
    var tf5 = fetchMacdHist_("5m");
    var tf3 = fetchMacdHist_("3m");

    var m12 = tf12.macd, h12 = tf12.hist;
    var m4 = tf4.macd, h4 = tf4.hist;
    var m1 = tf1.macd, h1 = tf1.hist, p1 = tf1.price;
    var m30 = tf30.macd, h30 = tf30.hist, p30 = tf30.price;
    var m15 = tf15.macd, h15 = tf15.hist, p15 = tf15.price;
    var m5 = tf5.macd, h5 = tf5.hist, p5 = tf5.price;
    var m3 = tf3.macd, h3 = tf3.hist;

    var values = [m12, h12, m4, h4, m1, h1, m30, h30, m15, h15, m5, h5, m3, h3];
    if (values.some(function (v) { return v === null || v === undefined; })) {
      state.consecutiveErrors++;
      Logger.log("Skipping cycle: fetch failure (" + state.consecutiveErrors + "/" + ERROR_ALERT_THRESHOLD + ")");
      if (state.consecutiveErrors >= ERROR_ALERT_THRESHOLD && !state.errorAlertSent) {
        sendTelegram_("⚠️ BTC.P bot has failed " + state.consecutiveErrors + " cycles in a row. Check the bot — it may be stuck or Binance/network may be down.");
        state.errorAlertSent = true;
      }
      saveState_(state);
      return;
    }
    state.consecutiveErrors = 0;
    state.errorAlertSent = false;

    var nowStr = Utilities.formatDate(new Date(), "GMT+4", "yyyy-MM-dd HH:mm");
    var volume = fetchBtcVolume_();

    // ======================
    // CONDITIONS
    // ======================
    var cond5mHl = (h1 > 0 && m1 > 0 && h15 > 0 && m15 > 0 && h5 < 0 && m5 > 0);
    var cond5mLh = (h1 < 0 && m1 < 0 && h15 < 0 && m15 < 0 && h5 > 0 && m5 < 0);
    var cond15mHl = (h4 > 0 && h1 > 0 && m1 > 0 && h15 < 0 && m15 > 0 && h3 < 0 && m3 < 0);
    var cond15mLh = (h4 < 0 && h1 < 0 && m1 < 0 && h15 > 0 && m15 < 0 && h3 > 0 && m3 > 0);
    var cond30mLong = ((h4 > 0 || m4 > 0) && m1 > 0 && h1 > 0 && h30 > 0 && m30 > 0 && h15 < 0 && m15 > 0 && h3 < 0 && m3 < 0);
    var cond30mShort = ((h4 < 0 || m4 < 0) && m1 < 0 && h1 < 0 && h30 < 0 && m30 < 0 && h15 > 0 && m15 < 0 && h3 > 0 && m3 > 0);
    var cond1hHl = (h4 > 0 && m4 > 0 && h12 > 0 && m12 > 0 && m1 > 0 && h1 < 0 && m15 < 0 && h15 < 0);
    var cond1hLh = (h4 < 0 && m4 < 0 && h12 < 0 && m12 < 0 && m1 < 0 && h1 > 0 && m15 > 0 && h15 > 0);

    var setupConfluence = [
      ["5M Higher Low", [
        ["1H MACD positive", m1 > 0, m1, tf1.macdStd],
        ["1H Histogram positive", h1 > 0, h1, tf1.histStd],
        ["15M MACD positive", m15 > 0, m15, tf15.macdStd],
        ["15M Histogram positive", h15 > 0, h15, tf15.histStd],
        ["5M MACD positive", m5 > 0, m5, tf5.macdStd],
        ["5M Histogram negative", h5 < 0, h5, tf5.histStd]
      ]],
      ["5M Lower High", [
        ["1H MACD negative", m1 < 0, m1, tf1.macdStd],
        ["1H Histogram negative", h1 < 0, h1, tf1.histStd],
        ["15M MACD negative", m15 < 0, m15, tf15.macdStd],
        ["15M Histogram negative", h15 < 0, h15, tf15.histStd],
        ["5M MACD negative", m5 < 0, m5, tf5.macdStd],
        ["5M Histogram positive", h5 > 0, h5, tf5.histStd]
      ]],
      ["15M Higher Low", [
        ["4H Histogram positive", h4 > 0, h4, tf4.histStd],
        ["1H MACD positive", m1 > 0, m1, tf1.macdStd],
        ["1H Histogram positive", h1 > 0, h1, tf1.histStd],
        ["15M MACD positive", m15 > 0, m15, tf15.macdStd],
        ["15M Histogram negative", h15 < 0, h15, tf15.histStd],
        ["3M MACD negative", m3 < 0, m3, tf3.macdStd],
        ["3M Histogram negative", h3 < 0, h3, tf3.histStd]
      ]],
      ["15M Lower High", [
        ["4H Histogram negative", h4 < 0, h4, tf4.histStd],
        ["1H MACD negative", m1 < 0, m1, tf1.macdStd],
        ["1H Histogram negative", h1 < 0, h1, tf1.histStd],
        ["15M MACD negative", m15 < 0, m15, tf15.macdStd],
        ["15M Histogram positive", h15 > 0, h15, tf15.histStd],
        ["3M MACD positive", m3 > 0, m3, tf3.macdStd],
        ["3M Histogram positive", h3 > 0, h3, tf3.histStd]
      ]],
      ["30M Long Invalidation", [
        ["4H Histogram or MACD positive", (h4 > 0 || m4 > 0), h4, tf4.histStd],
        ["1H MACD positive", m1 > 0, m1, tf1.macdStd],
        ["1H Histogram positive", h1 > 0, h1, tf1.histStd],
        ["30M MACD positive", m30 > 0, m30, tf30.macdStd],
        ["30M Histogram positive", h30 > 0, h30, tf30.histStd],
        ["15M MACD positive", m15 > 0, m15, tf15.macdStd],
        ["15M Histogram negative", h15 < 0, h15, tf15.histStd],
        ["3M MACD negative", m3 < 0, m3, tf3.macdStd],
        ["3M Histogram negative", h3 < 0, h3, tf3.histStd]
      ]],
      ["30M Short Invalidation", [
        ["4H Histogram or MACD negative", (h4 < 0 || m4 < 0), h4, tf4.histStd],
        ["1H MACD negative", m1 < 0, m1, tf1.macdStd],
        ["1H Histogram negative", h1 < 0, h1, tf1.histStd],
        ["30M MACD negative", m30 < 0, m30, tf30.macdStd],
        ["30M Histogram negative", h30 < 0, h30, tf30.histStd],
        ["15M MACD negative", m15 < 0, m15, tf15.macdStd],
        ["15M Histogram positive", h15 > 0, h15, tf15.histStd],
        ["3M MACD positive", m3 > 0, m3, tf3.macdStd],
        ["3M Histogram positive", h3 > 0, h3, tf3.histStd]
      ]],
      ["1H Higher Low", [
        ["4H Histogram positive", h4 > 0, h4, tf4.histStd],
        ["4H MACD positive", m4 > 0, m4, tf4.macdStd],
        ["12H Histogram positive", h12 > 0, h12, tf12.histStd],
        ["12H MACD positive", m12 > 0, m12, tf12.macdStd],
        ["1H MACD positive", m1 > 0, m1, tf1.macdStd],
        ["1H Histogram negative", h1 < 0, h1, tf1.histStd],
        ["15M MACD negative", m15 < 0, m15, tf15.macdStd],
        ["15M Histogram negative", h15 < 0, h15, tf15.histStd]
      ]],
      ["1H Lower High", [
        ["4H Histogram negative", h4 < 0, h4, tf4.histStd],
        ["4H MACD negative", m4 < 0, m4, tf4.macdStd],
        ["12H Histogram negative", h12 < 0, h12, tf12.histStd],
        ["12H MACD negative", m12 < 0, m12, tf12.macdStd],
        ["1H MACD negative", m1 < 0, m1, tf1.macdStd],
        ["1H Histogram positive", h1 > 0, h1, tf1.histStd],
        ["15M MACD positive", m15 > 0, m15, tf15.macdStd],
        ["15M Histogram positive", h15 > 0, h15, tf15.histStd]
      ]]
    ];

    // ======================
    // ALERTS
    // ======================
    var biasLine = "Bias:\n12H " + biasEmoji_(h12) + " | 4H " + biasEmoji_(h4) + " | 1H " + biasEmoji_(h1);

    maybeAlert_(state, "5m_hl", cond5mHl, "📈 BTC.P 5M Higher Low Setup\nPrice: " + p5 + "\nTime: " + nowStr + "\n\n" + biasLine, "5M Higher Low", volume, nowSec);
    maybeAlert_(state, "5m_lh", cond5mLh, "📉 BTC.P 5M Lower High Setup\nPrice: " + p5 + "\nTime: " + nowStr + "\n\n" + biasLine, "5M Lower High", volume, nowSec);
    maybeAlert_(state, "15m_hl", cond15mHl, "📈 BTC.P 15M Higher Low Setup\nPrice: " + p15 + "\nTime: " + nowStr + "\n\n" + biasLine, "15M Higher Low", volume, nowSec);
    maybeAlert_(state, "15m_lh", cond15mLh, "📉 BTC.P 15M Lower High Setup\nPrice: " + p15 + "\nTime: " + nowStr + "\n\n" + biasLine, "15M Lower High", volume, nowSec);
    maybeAlert_(state, "30m_long", cond30mLong, "🟢 BTC.P Potential 30 Minute Long Invalidation Play\nPrice: " + p30 + "\nTime: " + nowStr + "\n\n" + biasLine, "30M Long Invalidation", volume, nowSec);
    maybeAlert_(state, "30m_short", cond30mShort, "🔴 BTC.P Potential 30 Minute Short Invalidation Play\nPrice: " + p30 + "\nTime: " + nowStr + "\n\n" + biasLine, "30M Short Invalidation", volume, nowSec);
    maybeAlert_(state, "1h_hl", cond1hHl, "📈 BTC.P 1H Higher Low Setup\nPrice: " + p1 + "\nTime: " + nowStr + "\n\n" + biasLine, "1H Higher Low", volume, nowSec);
    maybeAlert_(state, "1h_lh", cond1hLh, "📉 BTC.P 1H Lower High Setup\nPrice: " + p1 + "\nTime: " + nowStr + "\n\n" + biasLine, "1H Lower High", volume, nowSec);

    Logger.log("5M HL:" + cond5mHl + " | 5M LH:" + cond5mLh + " | 15M HL:" + cond15mHl + " | 15M LH:" + cond15mLh +
      " | 30M LONG:" + cond30mLong + " | 30M SHORT:" + cond30mShort + " | 1H HL:" + cond1hHl + " | 1H LH:" + cond1hLh);

    // ======================
    // SUPABASE PUSH (every cycle)
    // ======================
    var closest = computeClosestSetup_(setupConfluence);
    pushSignalsToSupabase_([{
      symbol: "BTC",
      category: "bitcoin",
      setup: closest.bestName,
      last_setup: formatLastSetup_(state, nowSec),
      volume: volume,
      tradingview_url: BTC_TRADINGVIEW_URL,
      market_bias: {
        "12H": h12 > 0 ? "green" : "red",
        "4H": h4 > 0 ? "green" : "red",
        "1H": h1 > 0 ? "green" : "red"
      },
      closest_setup: closest.bestName + " (" + closest.met.length + "/" + closest.total + " Confluence Met)",
      confluence_met: closest.met,
      confluence_not_met: closest.unmet,
      heartbeat_at: new Date().toISOString()
    }]);

    // ======================
    // HEARTBEAT (every 2 hours, skipped during quiet hours)
    // ======================
    if ((nowSec - state.lastHeartbeat) >= HEARTBEAT_INTERVAL_SECONDS) {
      var uaeDate = new Date(Date.now() + UAE_OFFSET_HOURS * 3600000);
      var uaeHour = uaeDate.getUTCHours();
      var uaeMinute = uaeDate.getUTCMinutes();
      if (inQuietHours_(uaeHour, uaeMinute)) {
        Logger.log("Heartbeat due but skipped (quiet hours).");
      } else {
        sendHeartbeat_(state, h12, h4, h1, setupConfluence, nowSec);
      }
      state.lastHeartbeat = nowSec;
    }

    // ======================
    // DAILY SUMMARY (once a day at 8:00 AM UAE time)
    // ======================
    var uaeDateForSummary = new Date(Date.now() + UAE_OFFSET_HOURS * 3600000);
    var uaeHourForSummary = uaeDateForSummary.getUTCHours();
    var uaeDateStr = Utilities.formatDate(uaeDateForSummary, "UTC", "yyyy-MM-dd"); // already UAE-shifted above
    if (uaeHourForSummary >= DAILY_SUMMARY_HOUR && state.lastDailySummaryDate !== uaeDateStr) {
      sendDailySummary_(state, nowSec);
      state.lastDailySummaryDate = uaeDateStr;
    }

    saveState_(state);
  } catch (e) {
    Logger.log("ERROR (main loop): " + e);
    saveState_(state);
  }
}
