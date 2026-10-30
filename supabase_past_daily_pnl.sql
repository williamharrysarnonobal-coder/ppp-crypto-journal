-- Past trading days from before the journal (old spreadsheets). One row per
-- user per day: the day's net P&L and W/L/BE counts, nothing else — no coin,
-- no times, no notes. Shown on the Calendar and Year overview only, marked as
-- "old", and never added to any total or stat.

create table if not exists past_daily_pnl (
  user_id uuid not null references auth.users(id) default auth.uid(),
  day date not null,
  pnl numeric not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  bes int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table past_daily_pnl enable row level security;

drop policy if exists "own past days select" on past_daily_pnl;
create policy "own past days select" on past_daily_pnl for select
  using (auth.uid() = user_id and is_approved_user());
drop policy if exists "own past days insert" on past_daily_pnl;
create policy "own past days insert" on past_daily_pnl for insert
  with check (auth.uid() = user_id and is_approved_user());
drop policy if exists "own past days update" on past_daily_pnl;
create policy "own past days update" on past_daily_pnl for update
  using (auth.uid() = user_id and is_approved_user())
  with check (auth.uid() = user_id and is_approved_user());
drop policy if exists "own past days delete" on past_daily_pnl;
create policy "own past days delete" on past_daily_pnl for delete
  using (auth.uid() = user_id and is_approved_user());
