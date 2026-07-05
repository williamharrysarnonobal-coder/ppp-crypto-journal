-- Fixes a bug in the original supabase_position_setups.sql: it only added
-- SELECT/INSERT/DELETE policies, no UPDATE policy. Without one, RLS quietly
-- lets an UPDATE statement run but matches zero rows (no error) — so
-- "Add Note" and the Journal/Symbol edits looked like they worked, but
-- nothing actually persisted, which is why a refresh reset the Update
-- count to 0 and cleared the log. Safe to re-run.

drop policy if exists "update own position setups" on position_setups;
create policy "update own position setups"
  on position_setups for update
  using (auth.uid() = user_id and is_approved_user())
  with check (auth.uid() = user_id and is_approved_user());
