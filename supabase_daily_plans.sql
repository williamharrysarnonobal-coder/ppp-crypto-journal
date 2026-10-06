-- Daily Plan — one plan + review per user per calendar day (upserted via
-- on_conflict=user_id,plan_date, same pattern as mood_entries).
--   Plan:   bias, max_trades, key_levels, plan_notes  (before the session)
--   Review: followed ('Yes' | 'Partly' | 'No'), went_well, improve  (after)

create table if not exists daily_plans (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) default auth.uid(),
  plan_date date not null,
  bias text,
  max_trades int,
  key_levels text,
  plan_notes text,
  followed text,
  went_well text,
  improve text,
  psych jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, plan_date)
);

-- Psychology check-in (sleep, energy, stress, focus, emotion, tilt, …).
-- Safe to run again if the table already exists from an earlier version.
alter table daily_plans add column if not exists psych jsonb not null default '{}'::jsonb;

alter table daily_plans enable row level security;

drop policy if exists "own daily plans select" on daily_plans;
create policy "own daily plans select" on daily_plans for select
  using (auth.uid() = user_id and is_approved_user());
drop policy if exists "own daily plans insert" on daily_plans;
create policy "own daily plans insert" on daily_plans for insert
  with check (auth.uid() = user_id and is_approved_user());
drop policy if exists "own daily plans update" on daily_plans;
create policy "own daily plans update" on daily_plans for update
  using (auth.uid() = user_id and is_approved_user())
  with check (auth.uid() = user_id and is_approved_user());
drop policy if exists "own daily plans delete" on daily_plans;
create policy "own daily plans delete" on daily_plans for delete
  using (auth.uid() = user_id and is_approved_user());
