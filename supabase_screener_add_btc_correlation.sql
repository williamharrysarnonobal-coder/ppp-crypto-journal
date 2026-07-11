-- Screener: BTC correlation — Pearson correlation coefficient (-1 to 1)
-- between each coin's 1H price returns and BTC's own 1H price returns,
-- over the same lookback window. Computed by screener_bot.py, classified
-- into "Correlated" / "Non-Correlated" bands client-side (web layer) so
-- the threshold can be tuned without touching the running bot.

alter table screener_coins add column if not exists btc_correlation numeric;
