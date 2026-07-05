-- Non-destructive migration: adds notes_log to the existing position_setups
-- table. Replaces the single free-text "notes" field with a growing list of
-- timestamped entries — [{ts: ISO timestamp, text: string}, ...] — so every
-- note you add while a trade is open keeps its own datetime instead of you
-- managing line breaks yourself. The old "notes" column is left in place
-- but no longer used.

alter table position_setups add column if not exists notes_log jsonb not null default '[]'::jsonb;
