-- Non-destructive migration: splits the diary's single free-text note into
-- separate sections, because a trading day, a work day and a personal day are
-- three different stories that were being written into one box.
--
-- The existing "note" column is deliberately LEFT ALONE and keeps every entry
-- already written. It stays in the form as a catch-all ("Anything else"), so
-- nothing has to be migrated, re-typed, or guessed at — an old entry simply
-- shows up under that heading until you choose to move it.

alter table mood_entries add column if not exists note_trading text;
alter table mood_entries add column if not exists note_work text;
alter table mood_entries add column if not exists note_life text;
