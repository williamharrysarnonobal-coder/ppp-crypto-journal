-- Links each recurring item (installment/subscription) to the account that
-- pays it, and tracks how much of it has already been auto-applied to that
-- account's balance/transactions — so opening the app after being away
-- catches up on any bills that came due in between, without double-charging
-- ones already applied.

alter table finance_recurring add column if not exists account_id bigint references finance_accounts(id) on delete set null;
alter table finance_recurring add column if not exists payments_applied int not null default 0;
alter table finance_recurring add column if not exists last_billed date;
