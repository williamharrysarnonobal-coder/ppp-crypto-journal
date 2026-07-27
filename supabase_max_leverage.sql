-- Max Leverage (x) — part of the challenge preset's rule set (shown as an
-- informational pill on the account card), same pattern as the other rule
-- percentages already on this table.
alter table trading_accounts add column if not exists max_leverage numeric;
