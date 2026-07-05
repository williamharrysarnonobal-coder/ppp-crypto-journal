-- Moves the "already-notified completed challenges" list from browser
-- localStorage into the user's profile row, so the Challenges notification
-- doesn't re-fire for the same completion on every new device/browser/URL
-- (localStorage is stored per-site-address, so switching from the old
-- Netlify URL to tanaydana.com wiped it and re-notified everything).

alter table user_profile add column if not exists seen_completed_challenges jsonb not null default '[]'::jsonb;
