-- Playbooks — your own confluence checklists, editable in the app.
-- One row per playbook (Direction + Pattern Type). The built-in checklists are
-- the starting playbooks: editing one saves your version here and it replaces
-- the built-in for you only. Questions keep a fixed slot forever (answers on
-- trades point at the slot), so a removed question is kept as "retired"
-- inside items, never deleted.

create table if not exists playbooks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) default auth.uid(),
  key text not null,                       -- "Long|15 mins HL"
  name text,
  direction text not null,                 -- Long | Short
  trade_setup text,                        -- Bounce Play, Rejection Play, ...
  pattern_type text not null,
  min_pct int not null default 60,
  items jsonb not null default '[]'::jsonb,
  chart_patterns jsonb not null default '[]'::jsonb,
  no_auto_rules boolean not null default false,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

alter table playbooks enable row level security;

drop policy if exists "own playbooks select" on playbooks;
create policy "own playbooks select" on playbooks for select
  using (auth.uid() = user_id and is_approved_user());
drop policy if exists "own playbooks insert" on playbooks;
create policy "own playbooks insert" on playbooks for insert
  with check (auth.uid() = user_id and is_approved_user());
drop policy if exists "own playbooks update" on playbooks;
create policy "own playbooks update" on playbooks for update
  using (auth.uid() = user_id and is_approved_user())
  with check (auth.uid() = user_id and is_approved_user());
drop policy if exists "own playbooks delete" on playbooks;
create policy "own playbooks delete" on playbooks for delete
  using (auth.uid() = user_id and is_approved_user());
