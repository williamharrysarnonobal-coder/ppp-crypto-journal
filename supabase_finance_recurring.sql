-- Recurring money commitments: credit-card installments (hulugan) and
-- subscriptions. One table, split by "kind" — they share most fields:
--   Installment:  name, category, total_amount, total_payments, first_bill
--                 (monthly amount + progress are computed client-side)
--   Subscription: name, price, cycle, first_bill
-- Same owner-only RLS pattern as the rest of Finance.

create table if not exists finance_recurring (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) default auth.uid(),
  kind text not null check (kind in ('Installment','Subscription')),
  name text not null,
  category text,
  total_amount numeric,
  total_payments int,
  price numeric,
  cycle text,
  first_bill date,
  notes text,
  created_at timestamptz not null default now()
);

alter table finance_recurring enable row level security;

drop policy if exists "own finance recurring select" on finance_recurring;
create policy "own finance recurring select" on finance_recurring for select
  using (auth.uid() = user_id and is_approved_user());
drop policy if exists "own finance recurring insert" on finance_recurring;
create policy "own finance recurring insert" on finance_recurring for insert
  with check (auth.uid() = user_id and is_approved_user());
drop policy if exists "own finance recurring update" on finance_recurring;
create policy "own finance recurring update" on finance_recurring for update
  using (auth.uid() = user_id and is_approved_user())
  with check (auth.uid() = user_id and is_approved_user());
drop policy if exists "own finance recurring delete" on finance_recurring;
create policy "own finance recurring delete" on finance_recurring for delete
  using (auth.uid() = user_id and is_approved_user());
