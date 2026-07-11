-- Screener — one row per coin, upserted by a Python bot (script TBD) every
-- ~5 minutes, same pattern as trading_signals. Shared/read-only table (like
-- signal_alerts, economic_events): every approved user sees the same live
-- snapshot. The bot writes with the service_role key (bypasses RLS), so
-- there's no insert/update policy for regular users — this table is
-- read-only from the browser's point of view.
--
-- MACD per timeframe is stored as two independent flags instead of one
-- combined string — "zone" (is the MACD line above/below zero) and "cross"
-- (did MACD most recently cross above/below its signal line) — matching
-- the screener UI's "Bull Zone • Bull Cross" style labels, which the web
-- layer composes from these two columns.

create table if not exists screener_coins (
  symbol text primary key,
  exchange text,
  price_change_24h numeric,
  rsi_4h numeric,
  rsi_1h numeric,
  macd_1d_zone text check (macd_1d_zone in ('bull','bear')),
  macd_1d_cross text check (macd_1d_cross in ('bull','bear')),
  macd_4h_zone text check (macd_4h_zone in ('bull','bear')),
  macd_4h_cross text check (macd_4h_cross in ('bull','bear')),
  macd_1h_zone text check (macd_1h_zone in ('bull','bear')),
  macd_1h_cross text check (macd_1h_cross in ('bull','bear')),
  macd_15m_zone text check (macd_15m_zone in ('bull','bear')),
  macd_15m_cross text check (macd_15m_cross in ('bull','bear')),
  tradingview_url text,
  updated_at timestamptz not null default now()
);

alter table screener_coins enable row level security;

drop policy if exists "approved users can view screener" on screener_coins;
create policy "approved users can view screener"
  on screener_coins for select
  using (auth.uid() is not null and is_approved_user());
