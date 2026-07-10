-- Fixes a bug where adding a transaction dated in an already-settled month
-- (e.g. backdating to June after June's bill was already marked Paid) had
-- no effect on Owed. Owed was computed from a date CUTOFF (last_bill_paid),
-- so any transaction dated on/before that cutoff was silently treated as
-- already covered — even if it didn't exist yet when the bill was paid.
--
-- Fix: settlement is now tracked per-transaction instead of by date cutoff.
-- settled_bill stores which paid statement (month) covered this exact
-- transaction. Paying a bill stamps every CURRENTLY unsettled transaction
-- with that month; anything added afterwards — regardless of its own
-- tx_date — stays unsettled (null) until the next payment. Undo clears it
-- back to null so the same transactions return to Owed.

alter table finance_transactions add column if not exists settled_bill date;
