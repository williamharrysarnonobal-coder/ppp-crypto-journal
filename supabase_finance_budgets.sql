-- Finance Budgets — a flat monthly target amount per expense category
-- (e.g. "Food & Groceries: 5000/month"). Deliberately simple for a first
-- version: one number per category, tracked against the CURRENT calendar
-- month's actual Expense spend in that category — no rollover, no
-- multi-month history. Same RLS pattern as every other per-user table.

create table if not exists finance_budgets (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) default auth.uid(),
  category text not null,
  monthly_amount numeric not null,
  created_at timestamptz not null default now(),
  unique(user_id, category)
);

alter table finance_budgets enable row level security;

drop policy if exists "own finance budgets select" on finance_budgets;
create policy "own finance budgets select" on finance_budgets for select
  using (auth.uid() = user_id and is_approved_user());
drop policy if exists "own finance budgets insert" on finance_budgets;
create policy "own finance budgets insert" on finance_budgets for insert
  with check (auth.uid() = user_id and is_approved_user());
drop policy if exists "own finance budgets update" on finance_budgets;
create policy "own finance budgets update" on finance_budgets for update
  using (auth.uid() = user_id and is_approved_user())
  with check (auth.uid() = user_id and is_approved_user());
drop policy if exists "own finance budgets delete" on finance_budgets;
create policy "own finance budgets delete" on finance_budgets for delete
  using (auth.uid() = user_id and is_approved_user());
