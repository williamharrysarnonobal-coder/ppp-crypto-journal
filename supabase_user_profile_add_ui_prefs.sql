-- Syncs UI preferences (theme, font, accent color, journal column config,
-- form field config, dropdown options) into the user's profile row, so they
-- follow the ACCOUNT across devices/browsers/site URLs instead of living
-- only in one browser's localStorage — same reasoning as
-- supabase_user_profile_add_seen_challenges.sql.

alter table user_profile add column if not exists ui_prefs jsonb not null default '{}'::jsonb;
