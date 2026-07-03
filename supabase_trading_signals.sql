-- Run this in Supabase Studio > SQL Editor
-- (https://supabase.com/dashboard/project/ofohjebtyppsxgjuqxme/sql/new)
--
-- Stores the latest "heartbeat" state per symbol, written by your
-- crypto_live_bot.py / btc_live_bot.py scripts using your Supabase
-- SECRET (service_role) key. This is shared market data, not personal
-- trade history — every logged-in account sees the same rows. Only
-- the bot (via the secret key, which bypasses RLS) can write to it;
-- the web app can only read.

drop table if exists trading_signals;

create table trading_signals (
  id bigint generated always as identity primary key,
  symbol text not null unique,                   -- e.g. 'BTC', 'ETHUSDT.P'
  category text not null default 'altcoin',      -- 'bitcoin' | 'altcoin'
  setup text,                                    -- current/last triggered setup
  last_setup text,                               -- e.g. "None yet since bot started"
  volume numeric,
  tradingview_url text,
  market_bias jsonb not null default '{}'::jsonb,        -- {"12H":"green","4H":"green","1H":"red"}
  closest_setup text,                                    -- "30M Long Invalidation (8/9 Confluence Met)"
  confluence_met jsonb not null default '[]'::jsonb,      -- ["4H Histogram or MACD positive", ...]
  confluence_not_met jsonb not null default '[]'::jsonb,  -- [{"condition":"1H Histogram positive","note":"moderate distance"}]
  heartbeat_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table trading_signals enable row level security;

-- Any logged-in account can read — this is shared market data, not
-- scoped per user. No insert/update/delete policy exists for regular
-- users on purpose: the bot's secret key bypasses RLS entirely, so it
-- can always write; the browser (anon/authenticated) can only read.
create policy "Any logged-in user can view signals"
  on trading_signals for select
  using (auth.uid() is not null);
