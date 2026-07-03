-- Prop firm / trading accounts, with their specific rules — private per-user,
-- same isolation model as trading_journal. Lets us later build challenges
-- around actual compliance with YOUR account's rules (external requirements
-- you must follow), rather than self-imposed performance targets.

drop table if exists trading_accounts;

create table trading_accounts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) default auth.uid(),
  account_type text not null default 'Prop Firm', -- "Prop Firm" or "Exchange"
  account_name text not null,          -- e.g. "Upscale Trade 50K"
  prop_firm text,                      -- e.g. "Upscale Trade" (Prop Firm only)
  exchange_name text,                  -- e.g. "Binance" (Exchange only)
  account_size numeric,                -- e.g. 50000
  current_balance numeric,             -- e.g. 51200 (updated manually as you trade)
  start_date date,                     -- e.g. 2026-06-29 (challenge/account start date)
  phase text,                          -- e.g. "Evaluation Phase 1", "Funded"
  status text not null default 'Ongoing', -- "Ongoing", "Passed", or "Failed"
  phase_start_date date,               -- e.g. 2026-07-01 (when the CURRENT phase began)
  phase_start_balance numeric,         -- e.g. 10520 (balance when the current phase began)
  max_daily_loss_pct numeric,          -- e.g. 5   (breach limit per day)
  max_total_drawdown_pct numeric,      -- e.g. 10  (breach limit overall)
  profit_target_pct numeric,           -- e.g. 8   (needed to pass this phase)
  min_trading_days integer,            -- e.g. 5   (needed before payout/pass)
  consistency_rule_pct numeric,        -- e.g. 30  (no single day > X% of total profit)
  created_at timestamptz not null default now()
);

alter table trading_accounts enable row level security;

create policy "select own trading accounts"
  on trading_accounts for select
  using (auth.uid() = user_id);

create policy "insert own trading accounts"
  on trading_accounts for insert
  with check (auth.uid() = user_id);

create policy "update own trading accounts"
  on trading_accounts for update
  using (auth.uid() = user_id);

create policy "delete own trading accounts"
  on trading_accounts for delete
  using (auth.uid() = user_id);
