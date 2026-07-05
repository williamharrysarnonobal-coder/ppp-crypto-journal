-- Adds username + discord_username to user_profile, and auto-creates a
-- user_profile row for every new signup (like handle_new_user_access()
-- already does for user_access) — pulled straight from the signup form's
-- metadata (auth.users.raw_user_meta_data), since a brand-new signup has no
-- session yet to make an authenticated insert with.
--
-- Run this AFTER supabase_user_profile.sql. Safe to re-run.

alter table user_profile add column if not exists username text unique;
alter table user_profile add column if not exists discord_username text;
alter table user_profile add column if not exists email text;

-- Backfill email for any profile rows that already existed before this column did.
update user_profile p set email = u.email
from auth.users u
where p.user_id = u.id and p.email is null;

create or replace function handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into user_profile (user_id, email, display_name, username, discord_username)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'discord_username'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function handle_new_user_profile();

-- Username -> email lookup, callable by anyone (even logged-out visitors)
-- so the login page can resolve "username" to the real email Supabase Auth
-- needs — only ever returns the email string, nothing else about the user.
create or replace function get_email_for_username(p_username text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select email from user_profile where username = p_username limit 1;
$$;

grant execute on function get_email_for_username(text) to anon, authenticated;
