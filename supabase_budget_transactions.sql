-- Budget (2026-11-28): the family's market (palengke) tracker, its own list,
-- separate from Finance. One row per purchase. Nothing here touches Finance
-- accounts or balances. Amounts keep their own currency (AED or PHP); the app
-- shows the other one at the rate locked to tx_date.

create table if not exists budget_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) default auth.uid(),
  tx_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'AED',      -- AED | PHP
  description text,                          -- merchant, e.g. RED DIAMOND, ABU DHABI
  note text,
  card_last text,                            -- from the bank alert, e.g. 6334
  category text,                             -- e.g. Meat & Fish (list lives in ui_prefs.budget_settings)
  subcategory text,                          -- optional, free text, e.g. Chicken
  created_at timestamptz not null default now()
);

-- Safe to re-run: adds the category columns if the table was made before them.
alter table budget_transactions add column if not exists category text;
alter table budget_transactions add column if not exists subcategory text;
-- 'purchase' (spending) or 'topup' (money added to the period's budget, with its date).
alter table budget_transactions add column if not exists kind text not null default 'purchase';

create index if not exists budget_transactions_user_date on budget_transactions (user_id, tx_date desc);

alter table budget_transactions enable row level security;

drop policy if exists "own budget tx select" on budget_transactions;
create policy "own budget tx select" on budget_transactions for select
  using (auth.uid() = user_id and is_approved_user());
drop policy if exists "own budget tx insert" on budget_transactions;
create policy "own budget tx insert" on budget_transactions for insert
  with check (auth.uid() = user_id and is_approved_user());
drop policy if exists "own budget tx update" on budget_transactions;
create policy "own budget tx update" on budget_transactions for update
  using (auth.uid() = user_id and is_approved_user())
  with check (auth.uid() = user_id and is_approved_user());
drop policy if exists "own budget tx delete" on budget_transactions;
create policy "own budget tx delete" on budget_transactions for delete
  using (auth.uid() = user_id and is_approved_user());
