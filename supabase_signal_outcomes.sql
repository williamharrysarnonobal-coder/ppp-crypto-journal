-- Tracks whether a Bitcoin bot signal actually "played out" or not, so you
-- can measure signal accuracy over time. Only your account
-- (williamharry.s.arnonobal@gmail.com) can see or write to this table —
-- everyone else's RLS check fails, so the buttons/data are invisible to them.

drop table if exists signal_outcomes;

create table signal_outcomes (
  id bigint generated always as identity primary key,
  symbol text not null,
  setup text not null default '',
  outcome text not null check (outcome in ('played_out', 'not_played_out')),
  noted_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  unique (symbol, setup)
);

-- One row per distinct (symbol, setup) combo — marking Played Out / Didn't
-- Play Out again for the SAME setup updates this row (via upsert) instead of
-- creating a duplicate, so the accuracy count doesn't inflate from re-clicks.
-- A new row is only created once the bot reports a genuinely different setup.

alter table signal_outcomes enable row level security;

create policy "Only admin can view outcomes"
  on signal_outcomes for select
  using (auth.email() = 'williamharry.s.arnonobal@gmail.com');

create policy "Only admin can log outcomes"
  on signal_outcomes for insert
  with check (auth.email() = 'williamharry.s.arnonobal@gmail.com');
