-- Non-destructive migration: adds "post_stop_profit_result" to trading_journal.
--
-- The third of the post-exit questions, after post_be_result and
-- post_cutloss_result, asked of a stop that was moved into profit:
-- once that stop closed you out, what did price go on to do?
--   'TP After Stop Profit'  price carried on to TP; the stop took you out early
--   'SL After Stop Profit'  price came back to SL; the stop saved the profit
--   'N/A'                   this trade did not exit on Stop Profit
--
-- Nullable, no default: NULL means "not answered yet", which the journal shows
-- as a missing field on a Stop Profit trade.
alter table trading_journal add column if not exists post_stop_profit_result text;

-- Every trade that did NOT exit on Stop Profit has exactly one correct value.
update trading_journal
   set post_stop_profit_result = 'N/A'
 where post_stop_profit_result is null
   and exit_type is not null
   and btrim(exit_type) <> ''
   and lower(btrim(exit_type)) <> 'stop profit';
