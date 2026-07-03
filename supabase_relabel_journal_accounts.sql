-- Step 2: after checking supabase_check_journal_accounts.sql, relabel your
-- old trades so their "account" text matches your real account names exactly
-- (this is what lets the auto-balance-update and the new dropdown link up
-- correctly). Adjust the left-hand values below if Step 1 showed something
-- different (e.g. "50K" instead of "50k").
--
-- This is a plain relabel — it does NOT touch trading_accounts.current_balance,
-- since it's not going through the app's add/edit-trade flow.

update trading_journal set account = 'Upscale Trade 50K' where account = '50k';
update trading_journal set account = 'Upscale Trade 10K' where account = '10k';

-- You also had "25k", "100k", "200k", "Demo" as options before — if any of
-- your logged trades use those and you want them tied to a real account too,
-- tell me which ones and I'll add the matching update line.
