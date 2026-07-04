-- Non-destructive migration: adds comment_tl (Tagalog translation of the
-- "comment" field) to an existing economic_events table.

alter table economic_events add column if not exists comment_tl text;
