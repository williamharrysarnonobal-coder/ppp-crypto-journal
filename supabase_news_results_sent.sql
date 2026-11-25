-- News result to Telegram — one row per US news release that the Worker cron
-- has already posted (key = "US|<release time>"), so the same release is never
-- sent twice even when two cron runs overlap. Only the Worker's service_role
-- key (which bypasses RLS) reads and writes it.

create table if not exists news_results_sent (
  key text primary key,
  sent_at timestamptz not null default now()
);

alter table news_results_sent enable row level security;

-- No policies on purpose: regular users never need this table.
