-- Quick timestamped notes directly on a trade, separate from the plain
-- "Notes" text field and from a linked setup's own Setup Notes — lets you
-- jot something on any trade without opening Edit.

alter table trading_journal add column if not exists notes_log jsonb not null default '[]'::jsonb;
