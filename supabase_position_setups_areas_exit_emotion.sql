-- Areas & Emotions on Pending Setups: where the entry, stop and target sit
-- (e.g. "15m FVG", "Below Asia low", "Prev day high") and how you felt going
-- in and coming out. Filled in once in the Calculator (one setup or several
-- ticked together) and carried into the trade when you journal it.
-- entry_emotion already exists (supabase_position_setups_entry_emotion.sql).

alter table public.position_setups add column if not exists entry_area text;
alter table public.position_setups add column if not exists sl_area text;
alter table public.position_setups add column if not exists tp_area text;
alter table public.position_setups add column if not exists exit_emotion text;
