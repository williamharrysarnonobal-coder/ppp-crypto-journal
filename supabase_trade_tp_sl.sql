-- Planned TP/SL prices on journaled trades — carried over automatically from
-- the Pending Setup being journaled (entry_price already exists as the actual
-- fill). Lets the journal compare the PLAN against the actual close_price
-- (did you exit at your target, or bail early?). Optional fields — older
-- trades and Easy Add-only entries just stay null.
alter table trading_journal add column if not exists tp_price numeric;
alter table trading_journal add column if not exists sl_price numeric;
