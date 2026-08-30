-- Non-destructive migration: adds "post_cutloss_result" to trading_journal.
--
-- The mirror of post_be_result, asked of a manual cut instead of a breakeven
-- stop: once you were out, what did price go on to do?
--   'SL After Cutloss'  the cut saved you the rest of the loss
--   'TP After Cutloss'  the trade would have won; the cut is what lost it
--   'N/A'               this trade was not cut
--
-- Nullable and with no default on purpose. A NULL here means "not answered
-- yet", which the journal shows as a missing field on any Cut Loss trade, and
-- the dashboard reports separately as "no result logged" rather than folding
-- it into either side of the verdict. Defaulting existing rows to 'N/A' would
-- silently claim every past cut was checked and found neutral.
alter table trading_journal add column if not exists post_cutloss_result text;

-- Every trade that was NOT cut has exactly one correct value, and backfilling
-- them keeps the "unanswered" count honest: it should only ever contain real
-- cuts. Rows with a blank exit_type are left alone — nothing is known about
-- them yet either way.
update trading_journal
   set post_cutloss_result = 'N/A'
 where post_cutloss_result is null
   and exit_type is not null
   and btrim(exit_type) <> ''
   and lower(btrim(exit_type)) <> 'cut loss';
