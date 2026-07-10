-- Finance Challenge Leaderboard — same pattern as challenge_leaderboard
-- (Trading Journal), but kept as its own separate table so Finance
-- discipline points don't blend with Trading discipline points into one
-- confusing combined "rank."
--
-- Points are computed client-side (same as the Finance Challenges tab) and
-- each client upserts its own row here whenever it recomputes its
-- challenges — there's no server-side computation, this table is just the
-- shared, readable result of that computation.

create table if not exists finance_leaderboard (
  user_id uuid primary key references auth.users(id) default auth.uid(),
  display_name text,
  points integer not null default 0,
  rank_label text,
  updated_at timestamptz not null default now()
);

alter table finance_leaderboard enable row level security;

drop policy if exists "approved users can view finance leaderboard" on finance_leaderboard;
create policy "approved users can view finance leaderboard"
  on finance_leaderboard for select
  using (auth.uid() is not null and is_approved_user());

drop policy if exists "users can insert own finance leaderboard row" on finance_leaderboard;
create policy "users can insert own finance leaderboard row"
  on finance_leaderboard for insert
  with check (auth.uid() = user_id and is_approved_user());

drop policy if exists "users can update own finance leaderboard row" on finance_leaderboard;
create policy "users can update own finance leaderboard row"
  on finance_leaderboard for update
  using (auth.uid() = user_id and is_approved_user())
  with check (auth.uid() = user_id and is_approved_user());
