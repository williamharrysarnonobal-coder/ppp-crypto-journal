-- Non-destructive migration: adds "comment" (TradingView's explanation of
-- what the indicator measures) to an existing economic_events table.

alter table economic_events add column if not exists comment text;
