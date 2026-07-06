-- Sub-accounts: a Debit account (bank, e-wallet) can be split into named
-- pockets (e.g. "Emergency Fund", "Travel") that live under it. Each
-- sub-account is just another finance_accounts row with its own real
-- balance, linked back via parent_account_id. Deleting the parent deletes
-- its sub-accounts too (enforced in the confirm dialog client-side, and
-- here at the DB level so orphaned pockets can't linger).

alter table finance_accounts add column if not exists parent_account_id bigint references finance_accounts(id) on delete cascade;
