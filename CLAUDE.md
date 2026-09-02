# ppp-crypto-journal — Project Notes for Claude

Personal/multi-user crypto trading journal web app. Static HTML/CSS/JS (no build
step, no framework), Supabase backend (Postgres + Auth + Storage), hosted on
Netlify, connected to a GitHub repo.

## Critical rules — always follow these

- **Commit and push to `main` yourself, once a piece of work is verified.**
  Changed 2026-09-03: the old rule was to never push without asking. The user
  lifted it after a session where six new Pattern Types, a Trade Setup and an
  AOF Phase were all "missing" from his screen — the work was finished and even
  committed, but nothing reached the live site, and three rounds of "wala pa
  ring nagbago" went by before that was the thing found. He wants to refresh
  the page and see it. He was shown the cost below and chose this anyway.

  Billing is still metered, so the judgement that remains is *when*, not
  *whether*: **300 free credits/month, 15 credits per production deploy** — 20
  production deploys a month, and nothing warns you at 19. So batch. One push
  per finished, verified piece of work; never one per file edit. If a session
  is going to be a long back-and-forth of small tweaks, say so and hold them
  together. Branch/PR deploy previews are 0 credits and are still the right
  home for anything experimental (Netlify only auto-deploys `main`).

  Two things that make a push worth its credits, both learned the hard way:
  bump the `?v=` on every asset touched (the whole app is cached), and run the
  sims + browser probes in the scratchpad first — a wasted deploy costs the
  same as a good one.
- **Never put the Supabase secret/service_role key in client-side (browser)
  code** — only the anon/publishable key belongs in `js/supabase.js`. The
  secret key only appears in the Python bot scripts.
- `btc_live_bot.py` and `crypto_live_bot.py` contain hardcoded Telegram token +
  Supabase secret key — they are in `.gitignore` and must never be committed.
- Admin status is **role-based, not a hardcoded email**: the `user_access`
  table (see `supabase_user_access.sql`) holds each user's `role`
  ('admin'/'user') and `status` ('pending'/'approved'/'rejected').
  `isAdminUser()` in `js/dashboard.js` checks `CURRENT_USER_ROLE`, fetched
  from that table on login — never hardcode an email again. New signups
  start as `role='user', status='pending'` and are blocked (both by RLS via
  `is_approved_user()` and by the client-side pending screen) until an admin
  approves them from the Admin Console page. The **Played Out / Invalidated**
  signal-accuracy feature (`signal_outcomes` table) is gated the same way,
  via `is_admin()` in its RLS policies.
- After editing `js/dashboard.js`, run `node -c js/dashboard.js` to catch
  syntax errors. After editing `css/style.css`, check `{`/`}` counts match.
  After editing any `.html` file, check `<div>`/`</div>` (and `<svg>`/`</svg>`)
  counts match. This project has no test suite — these manual checks are the
  verification step.

## Stack / architecture

- Pages: `index.html`, `login.html`, `signup.html`, `dashboard.html` (main app
  shell — single page, view-switching via JS, no router).
- `css/style.css` — all styling, dark/light theme via `[data-theme]` + CSS vars.
- `js/supabase.js` — `SUPABASE_URL`, `SUPABASE_KEY` (anon), `sb` client.
- `js/auth.js` — signup/signin/signout/session helpers.
- `js/dashboard.js` — everything else (~2900+ lines): KPIs/charts, Trade
  Journal (with per-user RLS), Trade Alerts (bot alert history from
  `signal_alerts`, shared table, admin-only accuracy tracking), Achievements
  (private image gallery), Challenges (auto-computed gamification + points +
  rank ladder), Market News (TradingView embed), Profile (trader identity +
  inspiration board image), Configuration (column/field/dropdown customization).
- `supabase_*.sql` files — one per feature, run manually in the Supabase SQL
  editor. Several also need a Storage bucket created via the Supabase
  dashboard UI (SQL alone can't create buckets) — see comments in each file
  for exact bucket name and required settings (Public on/off, etc.).
- `btc_live_bot.py` / `crypto_live_bot.py` — user's existing Python bots
  (MACD/confluence scanners) that send Telegram alerts and mirror the same
  alert (same message, same moment) into Supabase so the dashboard's Trade
  Alerts page matches Telegram. **The `btc_live_bot.py` actually run by the
  user is this exact file in the repo root** — it's launched with a shell
  redirect (`> bot.log`), so `bot.log` in the repo root is the live log to
  check when debugging (not `.gitignore`d code, just runtime output —
  see the `.gitignore` note below). Restarting the bot process is required
  for any code edit to take effect (Python doesn't hot-reload).

### Trade Alerts data model (two tables, don't confuse them)

- **`signal_alerts`** (`supabase_signal_alerts.sql`) — what the Trade Alerts
  UI actually reads. One **inserted** row per fired alert (never
  overwritten), so it's a real history/notification feed. Columns include
  `seen` (bool) and support the "Read All" / per-row "🗑 Delete" (only shown
  once `seen`) buttons in `js/dashboard.js`. RLS lets any logged-in user
  select/update(`seen`)/delete; only the bots' secret key can insert.
- **`trading_signals`** (`supabase_trading_signals.sql`) — the older
  "current state per symbol" table, upserted every ~5 min bot cycle
  (`on_conflict=symbol`). Still written by the bots and still used for the
  bots' own Telegram heartbeat/"closest to triggering" logic, but **no
  longer read by the dashboard** — don't reintroduce a dependency on it for
  UI display, or the overwrite bug from before will resurface (each alert's
  detail got clobbered by the next cycle's "closest setup" forecast within
  minutes, since it was never actually a history table).

## Conventions established in this project

- Multi-user data (trading_journal, achievements, user_profile) uses
  `user_id uuid default auth.uid()` + RLS policies scoped to `auth.uid() =
  user_id`. Shared data (trading_signals, signal_alerts) has no `user_id`,
  RLS just requires `auth.uid() is not null` for select (and, for
  signal_alerts, also for update/delete — it's a shared notification inbox,
  not scoped per user).
- Storage buckets are private, folder-per-user (`{user_id}/...`), with RLS on
  `storage.objects` checking `auth.uid()::text = (storage.foldername(name))[1]`.
- Client-side config (column visibility/order, form field visibility/order,
  dropdown options) persists via `localStorage`, not Supabase — per-browser
  only, not synced across devices. Trade Alerts "seen" state is the
  exception: it lives in Supabase (`signal_alerts.seen`), so it's synced
  across devices/browsers on purpose.
- Modals reuse a small set of shared overlays (`#tradeModal`,
  `#achievementDetailModal`, `#challengeDetailModal`, `#lightboxModal`, etc.)
  rather than creating a new modal per feature where a generic one already fits.
