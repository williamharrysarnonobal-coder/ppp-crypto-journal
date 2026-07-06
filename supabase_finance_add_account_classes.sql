-- Finance accounts get a CLASS that changes which fields matter:
--   Debit  = your own money (bank, e-wallet, cash) -> just a balance
--   Credit = a credit card / credit line -> limit, owed, billing/due days;
--            "balance" becomes the AVAILABLE credit (limit - owed)
--   Borrow/Lend and Invest come later.
-- Also adds an uploadable icon (bank logo), stored in the existing
-- profile-images bucket.

alter table finance_accounts add column if not exists account_class text not null default 'Debit';
alter table finance_accounts add column if not exists icon_path text;
alter table finance_accounts add column if not exists credit_limit numeric;
alter table finance_accounts add column if not exists owed numeric;
alter table finance_accounts add column if not exists billing_day int;
alter table finance_accounts add column if not exists due_day int;
