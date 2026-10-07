-- How you felt before entering, picked in the Calculator. Carried from the
-- setup into the trade's Entry Emotion when it is journaled. The app saves
-- setups without it until this has been run.

alter table public.position_setups add column if not exists entry_emotion text;
