-- Pending/Journaled Setups now display the actual prices and BTC quantity
-- from the Position Size Calculator (Entry/TP/SL/Quantity) instead of the
-- old derived percentages — these columns store them per saved setup.
-- Older rows keep null here and render as "—".
alter table position_setups add column if not exists entry_price numeric;
alter table position_setups add column if not exists tp_price numeric;
alter table position_setups add column if not exists sl_price numeric;
alter table position_setups add column if not exists quantity numeric;
