-- Phone push notifications — one row per device that turned them on.
-- The browser writes its own row (endpoint + keys + what to send); the
-- Cloudflare Worker reads every row each minute with the service role key and
-- sends what is due. A device that turns push off deletes its row.
--   prefs: { market: bool, news: bool, reminders: bool,
--            markets: ["london","newyork",...], morning: "08:00", evening: "21:00",
--            tz: "Asia/Dubai" }

create table if not exists push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  prefs jsonb not null default '{}'::jsonb,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

drop policy if exists "own push select" on push_subscriptions;
create policy "own push select" on push_subscriptions for select
  using (auth.uid() = user_id and is_approved_user());
drop policy if exists "own push insert" on push_subscriptions;
create policy "own push insert" on push_subscriptions for insert
  with check (auth.uid() = user_id and is_approved_user());
drop policy if exists "own push update" on push_subscriptions;
create policy "own push update" on push_subscriptions for update
  using (auth.uid() = user_id and is_approved_user())
  with check (auth.uid() = user_id and is_approved_user());
drop policy if exists "own push delete" on push_subscriptions;
create policy "own push delete" on push_subscriptions for delete
  using (auth.uid() = user_id and is_approved_user());
