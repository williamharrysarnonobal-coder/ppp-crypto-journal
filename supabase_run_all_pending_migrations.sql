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
alter table trading_journal add column if not exists link text;
alter table trading_journal add column if not exists linked_setup_id bigint references position_setups(id) on delete set null;

-- economic_events
alter table economic_events add column if not exists comment text;
alter table economic_events add column if not exists comment_tl text;

-- achievements
alter table achievements add column if not exists amount numeric;

-- position_setups
alter table position_setups add column if not exists status text not null default 'Pending';
alter table position_setups add column if not exists symbol text;
alter table position_setups add column if not exists notes text;
alter table position_setups add column if not exists notes_log jsonb not null default '[]'::jsonb;

-- user_access
alter table user_access add column if not exists disabled_features text[] not null default '{}';

-- position_setups (before/after screenshots)
alter table position_setups add column if not exists before_screenshot text;
alter table position_setups add column if not exists after_screenshot text;

-- user_profile (challenge notification "seen" list — synced across devices)
alter table user_profile add column if not exists seen_completed_challenges jsonb not null default '[]'::jsonb;

-- user_profile (UI preferences — theme/font/accent/columns/form fields/options, synced across devices)
alter table user_profile add column if not exists ui_prefs jsonb not null default '{}'::jsonb;

-- user_profile (calendar event notification "seen" list — synced across devices)
alter table user_profile add column if not exists seen_event_notifications jsonb not null default '[]'::jsonb;

-- finance_accounts (account classes: Debit/Credit fields + icon)
-- NOTE: only works if finance_accounts exists (supabase_finance.sql)
alter table finance_accounts add column if not exists account_class text not null default 'Debit';
alter table finance_accounts add column if not exists icon_path text;
alter table finance_accounts add column if not exists credit_limit numeric;
alter table finance_accounts add column if not exists owed numeric;
alter table finance_accounts add column if not exists billing_day int;
alter table finance_accounts add column if not exists due_day int;
alter table finance_accounts add column if not exists card_number text;
alter table finance_accounts add column if not exists parent_account_id bigint references finance_accounts(id) on delete cascade;
alter table finance_accounts add column if not exists last_bill_paid date;

-- finance_recurring (link to paying account + auto-apply tracking)
-- NOTE: only works if finance_recurring exists (supabase_finance_recurring.sql)
alter table finance_recurring add column if not exists account_id bigint references finance_accounts(id) on delete set null;
alter table finance_recurring add column if not exists payments_applied int not null default 0;
alter table finance_recurring add column if not exists last_billed date;
