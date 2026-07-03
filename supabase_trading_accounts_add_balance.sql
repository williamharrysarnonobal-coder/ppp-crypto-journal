-- Non-destructive migration: adds current_balance to an existing
-- trading_accounts table without touching your existing rows.
-- Run this instead of re-running supabase_trading_accounts.sql (that one
-- starts with "drop table if exists" and would wipe your accounts).

alter table trading_accounts add column if not exists current_balance numeric;
