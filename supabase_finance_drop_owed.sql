-- Owed is now fully virtual (computed from installments + unsettled card
-- transactions at render time) — the stored column is dead weight and its
-- stale values were the source of the drift bugs. Safe to drop: nothing in
-- the app reads or writes it anymore.

alter table finance_accounts drop column if exists owed;
