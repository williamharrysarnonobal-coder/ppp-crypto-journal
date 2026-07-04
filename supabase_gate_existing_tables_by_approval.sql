-- Adds "and is_approved_user()" to every existing table's RLS policies, so a
-- pending/rejected user's queries return nothing at the database level (not
-- just hidden in the UI). Run supabase_user_access.sql FIRST — this file
-- depends on the is_approved_user()/is_admin() functions it creates.
-- Safe to re-run: every policy below is dropped and recreated.

-- ---------------- trading_journal ----------------
drop policy if exists "Users can view own trades" on trading_journal;
create policy "Users can view own trades"
  on trading_journal for select
  using (auth.uid() = user_id and is_approved_user());

drop policy if exists "Users can insert own trades" on trading_journal;
create policy "Users can insert own trades"
  on trading_journal for insert
  with check (auth.uid() = user_id and is_approved_user());

drop policy if exists "Users can update own trades" on trading_journal;
create policy "Users can update own trades"
  on trading_journal for update
  using (auth.uid() = user_id and is_approved_user())
  with check (auth.uid() = user_id and is_approved_user());

drop policy if exists "Users can delete own trades" on trading_journal;
create policy "Users can delete own trades"
  on trading_journal for delete
  using (auth.uid() = user_id and is_approved_user());

-- ---------------- trading_accounts ----------------
drop policy if exists "select own trading accounts" on trading_accounts;
create policy "select own trading accounts"
  on trading_accounts for select
  using (auth.uid() = user_id and is_approved_user());

drop policy if exists "insert own trading accounts" on trading_accounts;
create policy "insert own trading accounts"
  on trading_accounts for insert
  with check (auth.uid() = user_id and is_approved_user());

drop policy if exists "update own trading accounts" on trading_accounts;
create policy "update own trading accounts"
  on trading_accounts for update
  using (auth.uid() = user_id and is_approved_user())
  with check (auth.uid() = user_id and is_approved_user());

drop policy if exists "delete own trading accounts" on trading_accounts;
create policy "delete own trading accounts"
  on trading_accounts for delete
  using (auth.uid() = user_id and is_approved_user());

-- ---------------- notebook_entries ----------------
drop policy if exists "select own notebook entries" on notebook_entries;
create policy "select own notebook entries"
  on notebook_entries for select
  using (auth.uid() = user_id and is_approved_user());

drop policy if exists "insert own notebook entries" on notebook_entries;
create policy "insert own notebook entries"
  on notebook_entries for insert
  with check (auth.uid() = user_id and is_approved_user());

drop policy if exists "update own notebook entries" on notebook_entries;
create policy "update own notebook entries"
  on notebook_entries for update
  using (auth.uid() = user_id and is_approved_user())
  with check (auth.uid() = user_id and is_approved_user());

drop policy if exists "delete own notebook entries" on notebook_entries;
create policy "delete own notebook entries"
  on notebook_entries for delete
  using (auth.uid() = user_id and is_approved_user());

-- ---------------- achievements ----------------
drop policy if exists "select own achievements" on achievements;
create policy "select own achievements"
  on achievements for select
  using (auth.uid() = user_id and is_approved_user());

drop policy if exists "insert own achievements" on achievements;
create policy "insert own achievements"
  on achievements for insert
  with check (auth.uid() = user_id and is_approved_user());

drop policy if exists "update own achievements" on achievements;
create policy "update own achievements"
  on achievements for update
  using (auth.uid() = user_id and is_approved_user())
  with check (auth.uid() = user_id and is_approved_user());

drop policy if exists "delete own achievements" on achievements;
create policy "delete own achievements"
  on achievements for delete
  using (auth.uid() = user_id and is_approved_user());

-- ---------------- user_profile ----------------
drop policy if exists "select own profile" on user_profile;
create policy "select own profile"
  on user_profile for select
  using (auth.uid() = user_id and is_approved_user());

drop policy if exists "insert own profile" on user_profile;
create policy "insert own profile"
  on user_profile for insert
  with check (auth.uid() = user_id and is_approved_user());

drop policy if exists "update own profile" on user_profile;
create policy "update own profile"
  on user_profile for update
  using (auth.uid() = user_id and is_approved_user())
  with check (auth.uid() = user_id and is_approved_user());

-- ---------------- signal_alerts (shared feed, still approval-gated) ----------------
drop policy if exists "Any logged-in user can view alerts" on signal_alerts;
create policy "Any logged-in user can view alerts"
  on signal_alerts for select
  using (auth.uid() is not null and is_approved_user());

drop policy if exists "Any logged-in user can mark alerts seen" on signal_alerts;
create policy "Any logged-in user can mark alerts seen"
  on signal_alerts for update
  using (auth.uid() is not null and is_approved_user())
  with check (auth.uid() is not null and is_approved_user());

drop policy if exists "Any logged-in user can delete alerts" on signal_alerts;
create policy "Any logged-in user can delete alerts"
  on signal_alerts for delete
  using (auth.uid() is not null and is_approved_user());

-- ---------------- economic_events (shared, read-only, still approval-gated) ----------------
drop policy if exists "select economic events" on economic_events;
create policy "select economic events"
  on economic_events for select
  using (auth.uid() is not null and is_approved_user());

-- ---------------- signal_outcomes (was hardcoded to one email — now uses is_admin()) ----------------
drop policy if exists "Only admin can view outcomes" on signal_outcomes;
create policy "Only admin can view outcomes"
  on signal_outcomes for select
  using (is_admin());

drop policy if exists "Only admin can log outcomes" on signal_outcomes;
create policy "Only admin can log outcomes"
  on signal_outcomes for insert
  with check (is_admin());
