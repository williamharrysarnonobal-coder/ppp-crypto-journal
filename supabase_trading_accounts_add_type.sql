-- Non-destructive migration: adds account_type + exchange_name to an existing
-- trading_accounts table without touching your existing rows. Run this
-- instead of re-running supabase_trading_accounts.sql (that one starts with
-- "drop table if exists" and would wipe your accounts).

alter table trading_accounts add column if not exists account_type text not null default 'Prop Firm';
alter table trading_accounts add column if not exists exchange_name text;
