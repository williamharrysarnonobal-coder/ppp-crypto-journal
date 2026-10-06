-- Chart screenshots per timeframe: Higher TF, Setup TF, Entry TF.
-- Shape: { "htf": ["path", ...], "setup": [...], "entry": [...] }
-- The files live in the existing 'setup-screenshots' Storage bucket, in each
-- user's own folder, so no new bucket or policy is needed.

alter table public.trading_journal
  add column if not exists chart_shots jsonb not null default '{}'::jsonb;

alter table public.position_setups
  add column if not exists chart_shots jsonb not null default '{}'::jsonb;
