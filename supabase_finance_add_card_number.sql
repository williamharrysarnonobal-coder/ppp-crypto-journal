-- Card/account number for finance accounts — LAST 4 DIGITS ONLY, used to
-- match transactions in the upcoming easy-add flow (bank SMS/statements say
-- "card ending 1234"). Deliberately not the full number: matching only
-- needs the tail, and a leaked DB then exposes nothing usable.

alter table finance_accounts add column if not exists card_number text;
