-- Non-destructive migration: adds a nickname to the existing user_profile
-- table without touching your existing rows. Shown as "Name (nickname)"
-- in the Profile header.

alter table user_profile add column if not exists nickname text;
