-- Consolidated, safe-to-run-anytime bundle of every non-destructive
-- "add column if not exists" migration in this project. Every statement
-- below is idempotent — running this whole file does nothing to a column
-- that's already there, so it's safe to just run the whole thing instead
-- of tracking which individual supabase_*_add_*.sql files you've already
-- applied. It does NOT touch supabase_achievements.sql, supabase_setup.sql,
-- or any other base "drop table if exists" script — those are never safe
-- to re-run once you have real data.

-- trading_accounts
alter table trading_accounts add column if not exists current_balance numeric;
alter table trading_accounts add column if not exists start_date date;
alter table trading_accounts add column if not exists account_type text not null default 'Prop Firm';
alter table trading_accounts add column if not exists exchange_name text;
alter table trading_accounts add column if not exists status text not null default 'Ongoing';
alter table trading_accounts add column if not exists phase_start_date date;
alter table trading_accounts add column if not exists phase_start_balance numeric;

-- trading_journal
alter table trading_journal add column if not exists entry_price numeric;
alter table trading_journal add column if not exists close_price numeric;
alter table trading_journal add column if not exists position_size numeric;

-- economic_events
alter table economic_events add column if not exists comment text;
alter table economic_events add column if not exists comment_tl text;

-- achievements
alter table achievements add column if not exists amount numeric;
