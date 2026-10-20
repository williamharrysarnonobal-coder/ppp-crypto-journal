# Tanaydana (ppp-crypto-journal): project notes for Claude

Multi-user crypto trading journal + personal finance + mood diary web app,
live at tanaydana.com. Static HTML/CSS/JS (no build step, no framework),
Supabase backend (Postgres + Auth + Storage), hosted as a **Cloudflare Worker
with static assets** (`worker.js` + `wrangler.toml`), deployed automatically
on every push to `main` of the GitHub repo
`williamharrysarnonobal-coder/ppp-crypto-journal`.

The owner works on this from more than one machine (office laptop, home, and
Claude Code on the web), so **this file is the shared memory between those
sessions**. Anything a new session must know belongs here.

## Keep this file current (standing rule)

When a change adds a feature, a table, a convention, or a rule the next
session would otherwise have to rediscover, update this file **in the same
commit**. Remove anything that stops being true. Never put secrets here.

## Working with the owner

- Reply in **Tagalog/Taglish** (they sometimes switch to English; follow the
  latest message). All app UI copy stays in **English**.
- Keep answers short: the result and what to do next, not long explanations.
- Ask (with clear options) before building when a UI term or a business rule
  is ambiguous; don't guess repeatedly. Don't build duplicate features; check
  whether something similar already exists first.
- Finish assigned work end-to-end: implement, verify, commit, push, then
  report. Don't stop for routine approvals.
- Check **mobile (390px)** after every UI change: no sideways scroll, nothing
  cut off.
- Analysis panels compare **trades (win/loss counts, R), not money**: account
  sizes differ, so money misleads.
- Not deeply technical with git/Supabase: give exact click paths when they
  must do something themselves (e.g. running a SQL file).

## Verify, then push (every change)

1. `node -c js/dashboard.js` (and `node -c worker.js` if touched).
2. CSS `{`/`}` counts match; HTML open/close tag counts match.
3. Run the test harness in `tests/` (see `tests/README.md`):
   `node tests/runall.js` (~100 sims, must print "lahat pumasa") and
   `node tests/probe-mobile.js` (headless Chrome at 390px, fake Supabase).
   For a one-off browser check of a new feature, write it in
   `tests/mid-dbg.txt`, then `node tests/mk-dbg.js && node tests/probe-dbg.js`.
   When a change alters text a sim greps for, update the sim in the same
   commit. Also check the feature by hand in the browser.
4. Bump the cache-busting `?v=N` on `js/dashboard.js` and/or `css/style.css`
   in **every** `*.html` that loads them (the app is heavily cached; a missed
   bump looks like "walang nagbago").
5. Commit with a descriptive message and `git push origin main`. The push is
   the deploy. Only push when everything passed; batch small edits into one
   push per finished piece of work.

Git note (office laptop only): `git` is not on PATH; use GitHub Desktop's
bundled `git.exe` under `%LOCALAPPDATA%\GitHubDesktop\app-*\resources\app\git\cmd\`.

`dashboard.js` has mixed CRLF/LF line endings: when doing scripted
find/replace, try the LF form, then the CRLF form.

## Security rules (never break)

- Only the Supabase **anon/publishable** key may appear in browser code
  (`js/supabase.js`). The `sb_secret_`/service_role key lives only in
  Cloudflare Worker secrets and the local bot scripts.
- `btc_live_bot.py`, `crypto_live_bot.py`, `economic_calendar_bot.py`,
  `screener_bot.py` contain Telegram + Supabase secrets: they are
  `.gitignore`d, must never be committed, and their secrets must never be
  printed or pasted anywhere. They exist only on the office laptop.
- Cloudflare secrets (set in the dashboard, never in code):
  `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, `UPSCALE_ENC_KEY`.
- Upscale API keys are stored **encrypted** (`upscale_api_key_enc`) and never
  returned to the browser; the Worker decrypts and calls Upscale. The data
  backup strips that column. Shared/reused secrets still get real encryption
  at rest, never plaintext or obfuscation.
- Admin status is role-based (`user_access.role`), never a hardcoded email.
  New signups are `pending` and blocked by RLS (`is_approved_user()`) until an
  admin approves them in the Admin Console.

## Stack / files

- Pages: `index.html`, `login.html`, `signup.html`, `forgot-password.html`,
  `reset-password.html`, `dashboard.html` (single-page app shell; views
  switch via `switchView(name)`, no router).
- `js/dashboard.js`: almost all app logic (very large, ~33k lines).
- `css/style.css`: all styling; dark/light via `[data-theme]` + CSS vars.
- `js/supabase.js` (URL + anon key + client), `js/auth.js`.
- `worker.js`: Cloudflare Worker: static assets plus `/api/*` (Upscale proxy,
  volume, push test) and a **cron every minute** (`wrangler.toml`
  `[triggers]`) that sends phone push notifications.
- `sw.js`: service worker for web push; a tap opens the exact item via a
  `#open=KEY` deep link.
- `.assetsignore` keeps non-site files off tanaydana.com: `worker.js`,
  `wrangler.toml`, `CLAUDE.md`, `supabase_*.sql`, `tests/`. Add any new
  internal file there.
- `supabase_*.sql`: one file per feature, run **by the owner** in the Supabase
  SQL Editor. Settings › Database status (`DB_CHECKS` in dashboard.js) shows
  which ones are still missing. Add every new SQL file to `DB_CHECKS`, and
  every new per-user table to `BACKUP_TABLES`.

## Data conventions

- Per-user tables: `user_id uuid default auth.uid()` + RLS scoped to
  `auth.uid() = user_id` (and `is_approved_user()`).
- Shared tables (`signal_alerts`, `trading_signals`, `economic_events`,
  screener) have no `user_id`; RLS just requires a signed-in user.
- Storage buckets are private, folder-per-user (`{user_id}/...`).
- Trade charts live in `trading_journal.chart_shots` (`{htf, setup, entry}`
  arrays of paths in the `setup-screenshots` bucket). Bulk edit can put one
  uploaded chart on many trades, so **one file can be shared**: only delete a
  file from Storage when `_chartPathInUse(path)` says nothing else uses it.
- Client-side config (columns, form fields, dropdown options) is in
  `localStorage` (per browser). Saved options are **merged** with options
  added in code, never replaced.

## Trade Alerts (two tables, don't confuse them)

- **`signal_alerts`**: what the Trade Alerts page, the bell and phone push
  read. One inserted row per fired alert. `seen` is shared across devices.
  **Alerts expire after 6 hours**: the Worker cron (`expireTradeAlerts`)
  deletes older rows every minute (a real delete, by the owner's choice), and
  the dashboard only fetches the last 6 hours (`ALERT_TTL_HOURS` in both
  `worker.js` and `dashboard.js`; keep them equal). Expired alerts also drop
  out of the 🔔 list, and opening one says it expired.
- **`trading_signals`**: older "current state per symbol" table, upserted
  every bot cycle. Still written by the bots for their own heartbeat; **not**
  read by the dashboard. Don't reintroduce a UI dependency on it.
- Bots run locally on the office laptop via Task Scheduler. The ALTS bot
  (`crypto_live_bot.py`) is deliberately disabled, and BTC was removed from
  its coin list so re-enabling it can't double BTC alerts; only the BTC bot
  posts BTC alerts (symbol `BTC`). Code edits need a bot restart
  (Stop/Start-ScheduledTask 'BTC Bot'). The owner's default for bots is
  "check, don't change" unless they ask.
- **BTC bot watchdog**: the bot writes `trading_signals.heartbeat_at` every
  cycle. The Worker cron pushes "BTC Bot is offline" to admins' phones at 2h
  and 8h without a heartbeat (not between 12AM and 7AM UAE; sent at 7:00
  instead).
- **`btc_live_bot_v2.py`** (2026-10-16, gitignored, has secrets) replaces v1
  for BTC alerts. Six setups: 5M HL/LH (v1 rules plus the 1-minute MACD
  below zero for the long, above zero for the short), 15M HL/LH (also
  requires the 30M MACD and histogram on the trade's side; the 5M is on the
  far side of zero with its histogram already turned: bear + green for the
  HL, bull + red for the LH) and 30M
  Long / Short Invalidation (the 5M MACD+histogram replaces the 3M; in the
  invalidations the 1H MACD is on the far side of zero with its histogram
  turned, i.e. bear + green for the long, bull + red for the short, as in the
  Playbook, so an invalidation can never fire together with 15M HL/LH).
  Telegram uses 🟢 long / 🔴 short and links each alert to TradingView.
  The 1H setups and the 3M were dropped. v2 keeps its own `bot_v2.log` and
  `btc_last_sent_v2.json` in `Documents\BTC_BOT`. It runs from its own Task
  Scheduler task **"BTC Bot v2"** (at log-on, keeps running on battery,
  restarts within a minute on a crash; created without admin). The old
  **"BTC Bot"** task (v1, `btc_live_bot.py`) is **disabled** and kept only as
  a backup: never run both, or every alert is sent twice.
- **`crypto_live_bot_v2.py`** (alts, gitignored) runs from task **"ALTS Bot
  v2"**: four setups only, 15M HL/LH and 30M Long/Short Invalidation, same
  rules as BTC v2 (5M replaces 3M; histogram-only 1H in the invalidations),
  no 5M or 1H setups, BTC not in its coin list. Log `crypto_bot_v2.log`.
  Same anti-repeat rules as BTC: per coin+setup cooldown (15M 1h, 30M 1.5h)
  saved to `crypto_last_sent_v2.json`, and no alerts 12-7 AM UAE (a setup
  that formed overnight is not sent at 7). The old "ALTS Bot" task stays
  disabled.
- If the log shows `TELEGRAM ERROR ... group chat was upgraded to a supergroup
  chat`, Telegram gave the group a new id (`migrate_to_chat_id`): put it in
  `CHAT_ID` of that bot's v1 and v2 files and restart the task. Alerts still
  reach the app meanwhile; only Telegram fails. (BTC group migrated 2026-10-18.)
- Each v2 Telegram alert carries a per-coin-and-setup count under its title
  ("15M HL - Alert #2 today" = that setup came back for that coin), reset daily
  at 7 AM UAE; saved in `btc_alert_counts_v2.json` / `crypto_alert_counts_v2.json`
  (`count_alert()` in each bot).
- The office laptop drops into Modern Standby often (Kernel-Power 506/507 in
  the System log); right after waking, Wi-Fi isn't up yet and a Telegram send
  fails with an SSL EOF. v2 `send()` retries after 5s, 15s, 30s and 60s (not on
  a 400) and masks the bot token in the log.
- Both v2 tasks run through **`pyw.exe`** (no console window): with `py.exe`
  the bot dies when its window is closed (exit 0xC000013A).
- v2 Telegram carries **setup alerts only**: `SEND_TELEGRAM_HEARTBEAT` and
  `SEND_TELEGRAM_STATUS` (startup message, daily summary, failed-cycles
  warning) are False by the owner's choice. `heartbeat_at` is still written
  to the database every cycle, because the app's offline push depends on it.

## Confluence checklists = Playbooks

- `CONFLUENCE_SETUPS` in dashboard.js holds the built-in checklists, keyed
  `"Direction|Pattern Type"` (e.g. `Long|15 mins HL`); the key is how a setup
  or trade finds its checklist automatically. `CONFLUENCE_DEFAULTS` is an
  untouched copy.
- The **Playbooks** page (Growth › Playbooks) edits them. Saved versions live
  in the `playbooks` table (`supabase_playbooks.sql`) and override the
  built-ins via `applyPlaybooks()` at load. Users can create their own
  playbooks and share/import them as `TDPB1:` codes.
- **Answers are stored by question position** (`confluence_answers = {0:'yes',
  1:'no', ...}`). Never insert or delete a slot: retire a question with
  `archived: true`, append new ones at the end, and reorder with `order`.
  `_cflList()` gives the display list. A question added later carries
  `addedAt`, so older trades aren't penalised for leaving it blank.
- Answer types: plain Yes/No (`plain`), Radio with Yes/No/Almost/Other/Retest
  and per-option `points` (all existing yes/no questions), Buttons/Radio/
  Dropdown/Checkbox with custom options and points, Toggle, Text/Long text
  (record only, `noScore`). Scoring lives in `_confluenceProgress`,
  `_selectCredit`, `_ynCredit`; keep the tooltip, trade page, stats and
  win-rate review consistent with them.
- Auto-rules (`_autoUnfollowedRules`) match questions by **exact text**:
  rewording a question can switch an auto-rule off. The editor flags those
  questions and asks before saving a rewording; the list is
  `PB_AUTO_RULE_TEXTS`, which must match the `byText(...)` calls.
- The Confluence window keeps its Yes/Almost/No/Other buttons look (owner's
  choice); "Radio" is only how the editor describes those questions.

## UI conventions

- Reuse the shared modal overlays and share-image pattern (canvas +
  Copy image / Share… / Download PNG; see `drawMarketHoursShare`,
  `drawEconShare`) instead of inventing new ones.
- Times shown to the owner are UAE time (Asia/Dubai).
- Upscale auto-journal needs the setup's `upscale_order_id`. Orders placed from
  the Calculator are remembered per browser (localStorage, 24h, keyed
  account|entry|SL) and linked to the setup whichever comes first: at Trade This
  Setup, right after Place Order (`_linkSetupToOrder`), or at Journal time
  (`_linkPlacedOrderToSetup`). Orders placed in the Upscale terminal itself, or
  from another device, can't be linked, so those still need a paste.
- Calendar shares: a day popup has **Share day** + **Daily post**; a week (Σ)
  popup has **Share week** (`calShareModal` with `_calShareKind = 'week'`) +
  **Weekly post** (the Daily post modal with `_dpostScope = 'week'`: one row
  per traded day, lesson saved per week in localStorage). Weeks start Sunday,
  like the Calendar.
- Every share defaults to **$ as the main number** (Show $ amounts checked;
  Main number = $ amount) and always shows **Rules followed** (_rulesFollowedTxt,
  "5 of 6") next to the win rate, by the owner's choice.
