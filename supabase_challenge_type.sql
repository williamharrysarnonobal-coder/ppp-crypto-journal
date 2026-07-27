-- Which named challenge tier this account is ("Basic 5K", "Basic 10K", ...) —
-- lets Add/Edit Account auto-fill all the rule fields from a preset instead
-- of retyping the same percentages every time, and lets phase auto-advance
-- know the right Profit Target % to switch to for the new phase.
alter table trading_accounts add column if not exists challenge_type text;
