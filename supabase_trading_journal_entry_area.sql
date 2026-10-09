-- Where the entry was taken, in your own words, e.g. "15m FVG",
-- "Retest of Asia high". Sits beside TP Area and SL Area in Setup & Strategy;
-- the app suggests what you typed before so the same place is always written
-- the same way. Trades save without it until this has been run.

alter table public.trading_journal add column if not exists entry_area text;
