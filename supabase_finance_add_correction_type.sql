-- Adds a 4th tx_type, 'Correction', used only when a user directly rewrites
-- an account's stored balance (Finance > Accounts > Edit > Balance field)
-- instead of logging a real Income/Expense/Transfer. Keeping it out of
-- Income/Expense means it never gets counted as real spending/earning in
-- Reports, Dashboard KPIs, or Budget tracking (all of those match tx_type
-- === 'Income' / 'Expense' explicitly) — it only shows up as a plain
-- "was X, set to Y" row in Transactions and the account's own Full History.
alter table finance_transactions drop constraint if exists finance_transactions_tx_type_check;
alter table finance_transactions add constraint finance_transactions_tx_type_check
  check (tx_type in ('Income','Expense','Transfer','Correction'));
