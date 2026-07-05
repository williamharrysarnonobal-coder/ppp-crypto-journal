-- Position Size Calculator: logs a snapshot every time a user clicks
-- "Trade This Setup" for a given leverage row, so they can look back at what
-- they planned before entering a trade. Private per-user, gated behind
-- approval like every other table — run AFTER supabase_user_access.sql.

drop table if exists position_setups;

create table position_setups (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) default auth.uid(),
  account_id bigint references trading_accounts(id) on delete set null,
  account_name text,
  leverage numeric not null,
  margin numeric,
  stop_loss_pct numeric,
  take_profit_pct numeric,
  risk_amount numeric,
  position_size numeric,
  created_at timestamptz not null default now()
);

alter table position_setups enable row level security;

create policy "select own position setups"
  on position_setups for select
  using (auth.uid() = user_id and is_approved_user());

create policy "insert own position setups"
  on position_setups for insert
  with check (auth.uid() = user_id and is_approved_user());

create policy "update own position setups"
  on position_setups for update
  using (auth.uid() = user_id and is_approved_user())
  with check (auth.uid() = user_id and is_approved_user());

create policy "delete own position setups"
  on position_setups for delete
  using (auth.uid() = user_id and is_approved_user());
