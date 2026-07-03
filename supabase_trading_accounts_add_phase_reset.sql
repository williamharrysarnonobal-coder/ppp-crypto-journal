-- Non-destructive migration: adds phase_start_date + phase_start_balance to
-- an existing trading_accounts table without touching your existing rows.
-- These let "Total Earn" reset fresh at the start of a new phase, instead of
-- counting profit from Phase 1 toward the Phase 2 target too.

alter table trading_accounts add column if not exists phase_start_date date;
alter table trading_accounts add column if not exists phase_start_balance numeric;
