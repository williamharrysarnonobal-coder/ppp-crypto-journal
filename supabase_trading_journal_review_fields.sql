-- Review fields on each trade: what went wrong, how you felt going in and
-- coming out, and how the open trade was handled.
--   mistakes          comma-separated list (e.g. "Entered too early, Moved SL")
--   entry_emotion     one value (e.g. "Calm")
--   exit_emotion      one value (e.g. "Disappointed")
--   trade_management  comma-separated list (e.g. "SL to BE, Partials")
-- The app saves without these until this has been run, so nothing breaks before.

alter table public.trading_journal add column if not exists mistakes text;
alter table public.trading_journal add column if not exists entry_emotion text;
alter table public.trading_journal add column if not exists exit_emotion text;
alter table public.trading_journal add column if not exists trade_management text;
