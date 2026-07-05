-- High-impact calendar events previously had NO "seen" state — the bell/nav
-- badge stayed lit for up to 24 hours until the event itself passed, no
-- matter how many times you opened the notification center. This adds the
-- same per-account "already notified" tracking that challenges use.

alter table user_profile add column if not exists seen_event_notifications jsonb not null default '[]'::jsonb;
