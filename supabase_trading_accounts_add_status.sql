-- Non-destructive migration: adds status to an existing trading_accounts
-- table without touching your existing rows.

alter table trading_accounts add column if not exists status text not null default 'Ongoing';
