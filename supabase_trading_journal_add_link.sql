-- Non-destructive migration: adds "link" (chart link) to the existing
-- trading_journal table without touching your existing trades. The Trade
-- Journal table's Link column already existed in the UI but had no field
-- to fill it from and no database column to store it in.

alter table trading_journal add column if not exists link text;
