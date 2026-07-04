-- Non-destructive migration: adds entry_price, close_price, and
-- position_size to the existing trading_journal table without touching your
-- existing trades.

alter table trading_journal add column if not exists entry_price numeric;
alter table trading_journal add column if not exists close_price numeric;
alter table trading_journal add column if not exists position_size numeric;
