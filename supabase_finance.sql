-- Finance feature: personal money tracking (separate from trading_accounts,
-- which are prop-firm/exchange TRADING accounts — these are everyday money
-- accounts: banks, e-wallets, cash). Same RLS pattern as every other
-- per-user table: owner-only rows, gated by approval.

create table if not exists finance_accounts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) default auth.uid(),
  account_name text not null,
  account_type text not null default 'Bank',   -- Bank / E-Wallet / Cash / Crypto / Exchange / Other
  currency text not null default 'PHP',        -- PHP / USD / USDT
  current_balance numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

alter table finance_accounts enable row level security;

drop policy if exists "own finance accounts select" on finance_accounts;
create policy "own finance accounts select" on finance_accounts for select
  using (auth.uid() = user_id and is_approved_user());
drop policy if exists "own finance accounts insert" on finance_accounts;
create policy "own finance accounts insert" on finance_accounts for insert
  with check (auth.uid() = user_id and is_approved_user());
drop policy if exists "own finance accounts update" on finance_accounts;
create policy "own finance accounts update" on finance_accounts for update
  using (auth.uid() = user_id and is_approved_user())
  with check (auth.uid() = user_id and is_approved_user());
drop policy if exists "own finance accounts delete" on finance_accounts;
create policy "own finance accounts delete" on finance_accounts for delete
  using (auth.uid() = user_id and is_approved_user());

-- Transactions: one row per money movement. "Transfer" uses account_id
-- (from) + to_account_id; Income/Expense only use account_id.
create table if not exists finance_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) default auth.uid(),
  tx_date date not null default current_date,
  tx_type text not null check (tx_type in ('Income','Expense','Transfer')),
  amount numeric not null,
  account_id bigint references finance_accounts(id) on delete set null,
  to_account_id bigint references finance_accounts(id) on delete set null,
  category text,
  description text,
  created_at timestamptz not null default now()
);

alter table finance_transactions enable row level security;

drop policy if exists "own finance tx select" on finance_transactions;
create policy "own finance tx select" on finance_transactions for select
  using (auth.uid() = user_id and is_approved_user());
drop policy if exists "own finance tx insert" on finance_transactions;
create policy "own finance tx insert" on finance_transactions for insert
  with check (auth.uid() = user_id and is_approved_user());
drop policy if exists "own finance tx update" on finance_transactions;
create policy "own finance tx update" on finance_transactions for update
  using (auth.uid() = user_id and is_approved_user())
  with check (auth.uid() = user_id and is_approved_user());
drop policy if exists "own finance tx delete" on finance_transactions;
create policy "own finance tx delete" on finance_transactions for delete
  using (auth.uid() = user_id and is_approved_user());
