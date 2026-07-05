-- Lets an admin see every user's profile (username, display name, discord)
-- in the Admin Console — the existing "select own profile" policy only
-- covers your own row, so admins need an additional policy (RLS policies
-- for the same command are OR'd together, so regular users are unaffected).

drop policy if exists "admin can view all profiles" on user_profile;
create policy "admin can view all profiles"
  on user_profile for select
  using (is_admin());
