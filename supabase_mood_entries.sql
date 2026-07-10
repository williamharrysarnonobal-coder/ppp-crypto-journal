-- Mood Entries — "How Was Your Day?" daily check-in. One entry per user per
-- calendar day (upserted via on_conflict=user_id,entry_date, same pattern as
-- finance_budgets), with an optional free-text note about what happened.

create table if not exists mood_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) default auth.uid(),
  entry_date date not null,
  mood text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, entry_date)
);

alter table mood_entries enable row level security;

drop policy if exists "own mood entries select" on mood_entries;
create policy "own mood entries select" on mood_entries for select
  using (auth.uid() = user_id and is_approved_user());
drop policy if exists "own mood entries insert" on mood_entries;
create policy "own mood entries insert" on mood_entries for insert
  with check (auth.uid() = user_id and is_approved_user());
drop policy if exists "own mood entries update" on mood_entries;
create policy "own mood entries update" on mood_entries for update
  using (auth.uid() = user_id and is_approved_user())
  with check (auth.uid() = user_id and is_approved_user());
drop policy if exists "own mood entries delete" on mood_entries;
create policy "own mood entries delete" on mood_entries for delete
  using (auth.uid() = user_id and is_approved_user());
