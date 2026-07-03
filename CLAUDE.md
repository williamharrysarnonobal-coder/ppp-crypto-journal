# ppp-crypto-journal — Project Notes for Claude

Personal/multi-user crypto trading journal web app. Static HTML/CSS/JS (no build
step, no framework), Supabase backend (Postgres + Auth + Storage), hosted on
Netlify, connected to a GitHub repo.

## Critical rules — always follow these

- **Never push to GitHub `main` / deploy to Netlify without asking the user
  first**, even if a push was approved earlier in the session. Netlify billing
  is metered (300 free credits/month, 15 credits per production deploy, 0 for
  branch/PR deploy previews) — the user got burned by auto-pushing before. Work
  locally, test via `file://`, only push when explicitly told to deploy. If
  the user wants to back up work without deploying, push to a non-`main`
  branch instead (Netlify only auto-deploys `main` by default).
- **Never put the Supabase secret/service_role key in client-side (browser)
  code** — only the anon/publishable key belongs in `js/supabase.js`. The
  secret key only appears in the Python bot scripts.
- `btc_live_bot.py` and `crypto_live_bot.py` contain hardcoded Telegram token +
  Supabase secret key — they are in `.gitignore` and must never be committed.
- The **Played Out / Invalidated** signal-accuracy feature and any
  admin-only UI must stay restricted to `williamharry.s.arnonobal@gmail.com`
  (see `ADMIN_EMAIL` / `isAdminUser()` in `js/dashboard.js`).
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
  Journal (with per-user RLS), Trade Alerts (bot signals from
  `trading_signals`, shared table, admin-only accuracy tracking), Achievements
  (private image gallery), Challenges (auto-computed gamification + points +
  rank ladder), Market News (TradingView embed), Profile (trader identity +
  inspiration board image), Configuration (column/field/dropdown customization).
- `supabase_*.sql` files — one per feature, run manually in the Supabase SQL
  editor. Several also need a Storage bucket created via the Supabase
  dashboard UI (SQL alone can't create buckets) — see comments in each file
  for exact bucket name and required settings (Public on/off, etc.).
- `btc_live_bot.py` / `crypto_live_bot.py` — user's existing Python bots
  (MACD/confluence scanners) that push signals into `trading_signals` and
  send Telegram alerts independently of this web app.

## Conventions established in this project

- Multi-user data (trading_journal, achievements, user_profile) uses
  `user_id uuid default auth.uid()` + RLS policies scoped to `auth.uid() =
  user_id`. Shared data (trading_signals) has no `user_id`, RLS just requires
  `auth.uid() is not null` for select.
- Storage buckets are private, folder-per-user (`{user_id}/...`), with RLS on
  `storage.objects` checking `auth.uid()::text = (storage.foldername(name))[1]`.
- Client-side config (column visibility/order, form field visibility/order,
  dropdown options, "seen" signal state) persists via `localStorage`, not
  Supabase — per-browser only, not synced across devices.
- Modals reuse a small set of shared overlays (`#tradeModal`,
  `#achievementDetailModal`, `#challengeDetailModal`, `#lightboxModal`, etc.)
  rather than creating a new modal per feature where a generic one already fits.
