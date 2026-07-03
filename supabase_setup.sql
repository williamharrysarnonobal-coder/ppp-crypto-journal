-- Run this once in Supabase Studio > SQL Editor for your project
-- (https://supabase.com/dashboard/project/ofohjebtyppsxgjuqxme/sql/new)
--
-- What this does:
-- 1. Adds a user_id column to trading_journal, tying each row to a
--    Supabase Auth user. New inserts get it filled automatically
--    (default auth.uid()) since the app always sends the logged-in
--    user's access token.
-- 2. Turns on Row Level Security so each account can only see/edit/
--    delete its own trades.

alter table trading_journal
  add column if not exists user_id uuid references auth.users(id) default auth.uid();

alter table trading_journal enable row level security;

create policy "Users can view own trades"
  on trading_journal for select
  using (auth.uid() = user_id);

create policy "Users can insert own trades"
  on trading_journal for insert
  with check (auth.uid() = user_id);

create policy "Users can update own trades"
  on trading_journal for update
  using (auth.uid() = user_id);

create policy "Users can delete own trades"
  on trading_journal for delete
  using (auth.uid() = user_id);

-- IMPORTANT — existing rows created before this migration have
-- user_id = NULL, which means no logged-in user can see them
-- (NULL never equals anyone's auth.uid()). After you sign up your
-- first account, find your user id in Authentication > Users, then
-- run this once to claim your existing trades:
--
-- update trading_journal set user_id = 'PASTE-YOUR-USER-UUID-HERE' where user_id is null;
