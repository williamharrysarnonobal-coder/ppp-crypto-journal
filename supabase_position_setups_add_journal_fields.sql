-- Non-destructive migration: adds status/symbol/notes to the existing
-- position_setups table without touching your existing rows.
-- - status: set to 'Pending' whenever "Trade This Setup" is clicked.
-- - symbol/notes: filled in from the Saved Setups row's notes popup, then
--   carried into the Trade Journal via the "Journal" button's prefill.

alter table position_setups add column if not exists status text not null default 'Pending';
alter table position_setups add column if not exists symbol text;
alter table position_setups add column if not exists notes text;
