-- Confluence checklist: filled in on a Pending Setup (Calculator > Pending
-- Setups > "Confluence" button), then carried through to the actual
-- Trade Journal row once that setup gets Journaled.
alter table position_setups add column if not exists trade_type text;
alter table position_setups add column if not exists pattern_type text;
alter table position_setups add column if not exists confluence_answers jsonb;
alter table position_setups add column if not exists chart_pattern text;

alter table trading_journal add column if not exists confluence_answers jsonb;
alter table trading_journal add column if not exists chart_pattern text;
