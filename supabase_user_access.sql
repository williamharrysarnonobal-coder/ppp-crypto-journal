-- User Permission system: every signup starts as role='user', status='pending'
-- and cannot see/do anything (enforced by supabase_gate_existing_tables_by_approval.sql)
-- until an admin approves them from the new Admin Console page. Run this file
-- ONCE — it is safe to re-run (uses "if not exists"/"or replace"/"on conflict"
-- throughout) but only needs to happen a single time.

create table if not exists user_access (
  user_id uuid primary key references auth.users(id),
  email text not null,
  role text not null default 'user' check (role in ('admin','user')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz
);

alter table user_access enable row level security;

-- security definer + owned by the migration runner (postgres) so these can
-- read user_access internally without re-triggering user_access's own RLS
-- (which would otherwise recurse into itself).
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1 from user_access
    where user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function is_approved_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1 from user_access
    where user_id = auth.uid() and status = 'approved'
  );
$$;

drop policy if exists "select own access row or admin sees all" on user_access;
create policy "select own access row or admin sees all"
  on user_access for select
  using (auth.uid() = user_id or is_admin());

-- No insert policy for regular users on purpose — new rows are only ever
-- created by the trigger below (using the security-definer function's
-- elevated privileges), so a freshly-signed-up user has no way to write
-- their own status/role directly.
drop policy if exists "only admin can update access rows" on user_access;
create policy "only admin can update access rows"
  on user_access for update
  using (is_admin())
  with check (is_admin());

-- Auto-create a pending user_access row for every new Supabase Auth signup.
create or replace function handle_new_user_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into user_access (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_access on auth.users;
create trigger on_auth_user_created_access
  after insert on auth.users
  for each row execute function handle_new_user_access();

-- One-time backfill: capture anyone who already signed up before this
-- feature existed (defaults them to pending, same as a brand new signup —
-- review them in Admin Console like any other request), then immediately
-- promote the app owner to admin/approved so they're never locked out of
-- their own app.
insert into user_access (user_id, email)
select id, email from auth.users
on conflict (user_id) do nothing;

update user_access set role = 'admin', status = 'approved', decided_at = now()
where email = 'williamharry.s.arnonobal@gmail.com';
