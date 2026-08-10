-- Non-destructive migration: adds a profile picture to user_profile.
-- Stores only the object PATH inside the existing private "profile-images"
-- bucket (the same one the Vision Board and finance account icons use), not a
-- URL — the bucket is private, so the app mints a short-lived signed URL at
-- render time instead of holding a link that would expire or leak.
--
-- Existing rows are untouched: a null avatar_path simply means "no picture
-- yet", and the header falls back to the first letter of the display name.

alter table user_profile add column if not exists avatar_path text;
