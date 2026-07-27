-- "Daily Profit" — the % of account size a day needs to clear to count
-- toward Profitable Trading Days. Was hardcoded to a flat $50 before;
-- real accounts (Upscale) use 0.5% of account size, which scales
-- correctly across different account sizes ($25 on 5K, $50 on 10K, etc).
alter table trading_accounts add column if not exists min_daily_profit_pct numeric;
