-- Run this in Supabase Studio > SQL Editor
-- (https://supabase.com/dashboard/project/ofohjebtyppsxgjuqxme/sql/new)
--
-- Stores every individual Telegram alert as its own row — a real
-- notification history — instead of trading_signals' single "current
-- state" row per symbol that gets overwritten every ~5-minute bot cycle.
-- Written by the bot scripts (btc_live_bot.py / crypto_live_bot.py) using
-- the Supabase secret key. Read, marked-seen, and deleted by the web app
-- using the logged-in user's session — this is a shared notification
-- inbox (not scoped per user), same as trading_signals.

create table signal_alerts (
  id bigint generated always as identity primary key,
  symbol text not null,
  category text not null default 'altcoin',      -- 'bitcoin' | 'altcoin'
  setup text,                                    -- e.g. "5M Higher Low"
  message text not null,                         -- exact text sent to Telegram
  volume numeric,
  tradingview_url text,
  alert_at timestamptz not null default now(),   -- exact moment the Telegram alert was sent
  seen boolean not null default false
);

alter table signal_alerts enable row level security;

create policy "Any logged-in user can view alerts"
  on signal_alerts for select
  using (auth.uid() is not null);

-- Lets the Trade Alerts page's "mark seen" / "Read All" actions run from
-- the browser. No insert policy for regular users on purpose — only the
-- bot's secret key (which bypasses RLS) creates new alert rows.
create policy "Any logged-in user can mark alerts seen"
  on signal_alerts for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Lets the "Delete" button remove an alert once you've seen it.
create policy "Any logged-in user can delete alerts"
  on signal_alerts for delete
  using (auth.uid() is not null);

create index signal_alerts_alert_at_idx on signal_alerts (alert_at desc);
