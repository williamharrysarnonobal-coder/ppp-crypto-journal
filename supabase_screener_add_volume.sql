-- Screener: 24H quote volume (USD-equivalent), pulled straight from each
-- exchange's ticker (same field the alert bots already use for their own
-- Volume column).

alter table screener_coins add column if not exists volume_24h numeric;
