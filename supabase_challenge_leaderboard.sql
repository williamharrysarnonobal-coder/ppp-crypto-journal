-- Challenge Leaderboard — lets every approved user see everyone's total
-- challenge points and rank (not their trades or profile details), so the
-- Leaderboard page can rank all traders against each other.
--
-- Points are computed client-side (same as the Challenges page) and each
-- client upserts its own row here whenever it recomputes its challenges —
-- there's no server-side computation, this table is just the shared,
-- readable result of that computation.

create table if not exists challenge_leaderboard (
  user_id uuid primary key references auth.users(id) default auth.uid(),
  display_name text,
  points integer not null default 0,
  rank_label text,
  updated_at timestamptz not null default now()
);

alter table challenge_leaderboard enable row level security;

drop policy if exists "approved users can view leaderboard" on challenge_leaderboard;
create policy "approved users can view leaderboard"
  on challenge_leaderboard for select
  using (auth.uid() is not null and is_approved_user());

drop policy if exists "users can insert own leaderboard row" on challenge_leaderboard;
create policy "users can insert own leaderboard row"
  on challenge_leaderboard for insert
  with check (auth.uid() = user_id and is_approved_user());

drop policy if exists "users can update own leaderboard row" on challenge_leaderboard;
create policy "users can update own leaderboard row"
  on challenge_leaderboard for update
  using (auth.uid() = user_id and is_approved_user())
  with check (auth.uid() = user_id and is_approved_user());
