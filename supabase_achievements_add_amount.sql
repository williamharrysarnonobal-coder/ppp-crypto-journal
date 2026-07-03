-- Adds an "amount" column to the existing achievements table, so
-- Withdrawal achievements can record how much was withdrawn.
-- Safe to run even if achievements already has data — this does NOT
-- drop or recreate the table, just adds a new nullable column.

alter table achievements add column if not exists amount numeric;
