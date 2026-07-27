-- Risk Per Trade % — was hardcoded to 0.3% for every account on the card
-- display; now a real per-account field like the other rules.
alter table trading_accounts add column if not exists risk_per_trade_pct numeric;
