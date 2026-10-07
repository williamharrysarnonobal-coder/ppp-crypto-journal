-- App visits — one row per user per calendar day the app was opened.
-- Feeds the Daily Check-in Streak challenge. Written once a day with
-- on_conflict=user_id,visit_date (duplicates are ignored); never updated.

create table if not exists app_visits (
  user_id uuid not null references auth.users(id) default auth.uid(),
  visit_date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, visit_date)
);

alter table app_visits enable row level security;

drop policy if exists "own app visits select" on app_visits;
create policy "own app visits select" on app_visits for select
  using (auth.uid() = user_id and is_approved_user());
drop policy if exists "own app visits insert" on app_visits;
create policy "own app visits insert" on app_visits for insert
  with check (auth.uid() = user_id and is_approved_user());
drop policy if exists "own app visits delete" on app_visits;
create policy "own app visits delete" on app_visits for delete
  using (auth.uid() = user_id and is_approved_user());
