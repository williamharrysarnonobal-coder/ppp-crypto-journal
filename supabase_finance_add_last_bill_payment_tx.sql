-- Tracks which finance_transactions row was auto-created by clicking "Paid"
-- on a credit card (a Transfer from the chosen paying account, tagged
-- Debt & Loans / Credit card payments) — so Undo can find and delete that
-- exact transaction instead of guessing by date/category.

alter table finance_accounts add column if not exists last_bill_payment_tx_id bigint references finance_transactions(id) on delete set null;
