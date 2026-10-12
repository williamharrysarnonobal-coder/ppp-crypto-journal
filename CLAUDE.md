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
3. Exercise the change in a real browser (desktop and 390px mobile). On the
   office laptop there are headless-Chrome probes and ~100 regression sims in
   the session scratchpad; elsewhere, test by hand in the browser.
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
- Client-side config (columns, form fields, dropdown options) is in
  `localStorage` (per browser). Saved options are **merged** with options
  added in code, never replaced.

## Trade Alerts (two tables, don't confuse them)

- **`signal_alerts`**: what the Trade Alerts page, the bell and phone push
  read. One inserted row per fired alert (a history). `seen` is shared across
  devices.
- **`trading_signals`**: older "current state per symbol" table, upserted
  every bot cycle. Still written by the bots for their own heartbeat; **not**
  read by the dashboard. Don't reintroduce a UI dependency on it.
- Bots run locally on the office laptop via Task Scheduler (they stop when
  the laptop sleeps or runs on battery). The ALTS bot (`crypto_live_bot.py`)
  is deliberately disabled; only the BTC bot posts alerts (symbol `BTC`).
  Code edits need a bot restart. The owner's default for bots is "check, don't
  change" unless they ask.

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
  rewording a question can switch an auto-rule off.

## UI conventions

- Reuse the shared modal overlays and share-image pattern (canvas +
  Copy image / Share… / Download PNG; see `drawMarketHoursShare`,
  `drawEconShare`) instead of inventing new ones.
- Times shown to the owner are UAE time (Asia/Dubai).
