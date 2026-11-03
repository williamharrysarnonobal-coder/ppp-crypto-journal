-- Entry Confluence: why you took the trade, as short tags in your own words
-- ("15M bearish div", ".618", "Trendline rejection"), comma-separated. The app
-- suggests the tags you used before on the same Pattern Type, most used first.
-- Trades save without it until this has been run.

alter table public.trading_journal add column if not exists entry_confluence text;
