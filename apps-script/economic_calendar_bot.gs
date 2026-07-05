/**
 * Economic Calendar Bot — Google Apps Script port of economic_calendar_bot.py
 *
 * DEPLOY:
 * 1. Go to https://script.google.com/ -> New project (or add to the same
 *    project as btc_live_bot.gs — they can share one project and just have
 *    separate triggers).
 * 2. Paste this file in as a new script file.
 * 3. Project Settings -> Script Properties -> add:
 *      SUPABASE_SERVICE_KEY   (Supabase service_role secret key)
 * 4. Run `runEconomicCalendarBot` once manually to authorize external
 *    requests.
 * 5. Triggers -> Add Trigger:
 *      Function: runEconomicCalendarBot
 *      Event source: Time-driven
 *      Type: Hour timer -> Every 6 hours
 *
 * Same one-pass-per-call model as btc_live_bot.gs — no internal loop, the
 * time-driven trigger supplies the "every 6 hours" cadence. This bot has no
 * memory to carry between runs (translation cache is re-read from Supabase
 * every time), so it's a much more direct port than the BTC bot.
 */

var SUPABASE_URL = "https://ofohjebtyppsxgjuqxme.supabase.co";

// TradingView's own economic calendar endpoint — same data their public
// widget shows for free, fetched directly instead of through the embed.
// Not an officially documented third-party API, so it could change or get
// blocked without notice; fallback is
// https://nfs.faireconomy.media/ff_calendar_thisweek.json (this-week only,
// no signup).
var CALENDAR_URL = "https://economic-calendar.tradingview.com/events";
var COUNTRIES = "US,EU,GB,JP,CN,AU,CA,NZ,CH";
var DAYS_AHEAD = 30; // how far forward to pull each cycle

var IMPACT_LABELS = { "-1": "Low", "0": "Medium", "1": "High" };

// Same keyless endpoint translate.google.com's own web page uses — no API
// key, free, but unofficial/undocumented for third-party use like the
// calendar endpoint above. A short delay between calls keeps us well clear
// of any abuse throttling, and translations are cached in Supabase so the
// same boilerplate comment text is never sent twice.
var TRANSLATE_URL = "https://translate.googleapis.com/translate_a/single";
var TRANSLATE_DELAY_MS = 400;

function getSupabaseKey_() {
  var v = PropertiesService.getScriptProperties().getProperty("SUPABASE_SERVICE_KEY");
  if (!v) throw new Error("Missing Script Property: SUPABASE_SERVICE_KEY — set it in Project Settings > Script Properties.");
  return v;
}

function translateToTagalog_(text) {
  try {
    var url = TRANSLATE_URL + "?client=gtx&sl=en&tl=tl&dt=t&q=" + encodeURIComponent(text);
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var data = JSON.parse(resp.getContentText());
    return data[0].map(function (chunk) { return chunk[0]; }).join("");
  } catch (e) {
    Logger.log("Translation failed: " + e);
    return null;
  }
}

// Reuse already-translated comments instead of hitting the translate
// endpoint again — most comment text repeats across many events/countries
// (it describes the indicator, not the specific release).
function fetchExistingTranslations_() {
  var cache = {};
  try {
    var key = getSupabaseKey_();
    var url = SUPABASE_URL + "/rest/v1/economic_events?select=comment,comment_tl&comment_tl=not.is.null";
    var resp = UrlFetchApp.fetch(url, {
      headers: { apikey: key, Authorization: "Bearer " + key },
      muteHttpExceptions: true
    });
    var rows = JSON.parse(resp.getContentText());
    rows.forEach(function (row) {
      if (row.comment && row.comment_tl) cache[row.comment] = row.comment_tl;
    });
  } catch (e) {
    Logger.log("Couldn't load existing translations: " + e);
  }
  return cache;
}

function fetchEvents_() {
  var now = new Date();
  var fromTs = Utilities.formatDate(now, "UTC", "yyyy-MM-dd'T'00:00:00.000'Z'");
  var to = new Date(now.getTime() + DAYS_AHEAD * 24 * 3600000);
  var toTs = Utilities.formatDate(to, "UTC", "yyyy-MM-dd'T'00:00:00.000'Z'");

  var url = CALENDAR_URL + "?from=" + encodeURIComponent(fromTs) + "&to=" + encodeURIComponent(toTs) + "&countries=" + encodeURIComponent(COUNTRIES);
  var resp = UrlFetchApp.fetch(url, {
    headers: { Origin: "https://www.tradingview.com", "User-Agent": "Mozilla/5.0" },
    muteHttpExceptions: true
  });
  var data = JSON.parse(resp.getContentText());
  return data.result || [];
}

function upsertEvents_(events) {
  // keyed by "title|||country|||event_date" — the same triple the table's
  // unique constraint and our on_conflict clause use. A dict naturally
  // dedupes: if the feed ever returns the same key twice in one batch,
  // Postgres' "ON CONFLICT DO UPDATE" errors out for the whole request, so
  // we collapse duplicates here before sending anything.
  var rowsByKey = {};
  events.forEach(function (e) {
    var title = (e.title || "").trim();
    var eventDate = e.date;
    var country = e.country || null;
    var importance = e.importance;
    if (!title || !eventDate) return;
    if (importance !== 0 && importance !== 1) return; // skip Low impact — only Medium/High matter for trading
    var key = title + "|||" + country + "|||" + eventDate;
    rowsByKey[key] = {
      title: title,
      country: country,
      event_date: eventDate,
      impact: IMPACT_LABELS[String(importance)],
      forecast: e.forecast || null,
      previous: e.previous || null,
      actual: e.actual || null,
      comment: e.comment || null
    };
  });

  var rows = Object.keys(rowsByKey).map(function (k) { return rowsByKey[k]; });
  if (!rows.length) {
    Logger.log("No events to upsert this cycle.");
    return;
  }

  // Translate each distinct comment text once, reusing the cache both
  // across rows in this batch and across previous runs (via Supabase).
  var translationCache = fetchExistingTranslations_();
  var uniqueComments = {};
  rows.forEach(function (row) { if (row.comment) uniqueComments[row.comment] = true; });
  var toTranslate = Object.keys(uniqueComments).filter(function (c) { return !(c in translationCache); });

  if (toTranslate.length) {
    Logger.log("Translating " + toTranslate.length + " new unique comment(s) to Tagalog (this only happens once per comment — future runs reuse the cache)...");
    toTranslate.forEach(function (comment, i) {
      translationCache[comment] = translateToTagalog_(comment);
      if ((i + 1) % 5 === 0 || i + 1 === toTranslate.length) {
        Logger.log("  ...translated " + (i + 1) + "/" + toTranslate.length);
      }
      Utilities.sleep(TRANSLATE_DELAY_MS);
    });
    Logger.log("Done translating " + toTranslate.length + " comment(s).");
  }

  rows.forEach(function (row) {
    row.comment_tl = row.comment ? (translationCache[row.comment] || null) : null;
  });

  var key = getSupabaseKey_();
  var url = SUPABASE_URL + "/rest/v1/economic_events?on_conflict=title,country,event_date";
  var resp = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    payload: JSON.stringify(rows),
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() >= 300) {
    Logger.log("SUPABASE UPSERT ERROR: " + resp.getResponseCode() + " " + resp.getContentText().slice(0, 300));
  } else {
    Logger.log("Upserted " + rows.length + " economic events (" + DAYS_AHEAD + " days ahead).");
  }
}

// ==========================
// MAIN — call this from a time-driven trigger, every 6 hours
// ==========================
function runEconomicCalendarBot() {
  Logger.log("Economic calendar bot starting...");
  try {
    var events = fetchEvents_();
    upsertEvents_(events);
  } catch (e) {
    Logger.log("Fetch/upsert failed: " + e);
  }
}
