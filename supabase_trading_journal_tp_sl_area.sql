-- Where the TP and the SL were placed, in your own words, e.g.
-- "Prev day high", "4H FVG", "Below Asia low". The app suggests what you
-- typed before so the same place is always written the same way.
-- Trades save without these until this has been run.

alter table public.trading_journal add column if not exists tp_area text;
alter table public.trading_journal add column if not exists sl_area text;
