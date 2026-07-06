-- Remembers which month's statement was last settled per account, so the
-- card's "Payment for <month>" button flips to a "Paid" state after being
-- clicked and only reappears on the 5th of the following month.

alter table finance_accounts add column if not exists last_bill_paid date;
