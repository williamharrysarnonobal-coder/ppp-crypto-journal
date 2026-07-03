-- Achievements: private per-user gallery (tournament wins, withdrawal proofs, etc.)
-- Each user only sees their own uploads — same isolation model as trading_journal.

drop table if exists achievements;

create table achievements (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) default auth.uid(),
  category text not null check (category in ('Tournament', 'Withdrawal')),
  subject text not null,
  body text,
  amount numeric,
  image_path text not null,
  created_at timestamptz not null default now()
);

alter table achievements enable row level security;

create policy "select own achievements"
  on achievements for select
  using (auth.uid() = user_id);

create policy "insert own achievements"
  on achievements for insert
  with check (auth.uid() = user_id);

create policy "update own achievements"
  on achievements for update
  using (auth.uid() = user_id);

create policy "delete own achievements"
  on achievements for delete
  using (auth.uid() = user_id);


-- ============================================================
-- STORAGE SETUP (do this in the Supabase dashboard, not SQL editor):
-- 1. Go to Storage > New bucket
-- 2. Name it exactly:  achievements
-- 3. Leave "Public bucket" OFF (private — images are per-user)
-- ============================================================

-- Then run these in the SQL editor to restrict access per-user.
-- Images are uploaded to a path like  {user_id}/{filename}  so each user's
-- folder name IS their own uid — that's what these policies check.

drop policy if exists "Users can upload their own achievement images" on storage.objects;
create policy "Users can upload their own achievement images"
  on storage.objects for insert
  with check (bucket_id = 'achievements' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Users can view their own achievement images" on storage.objects;
create policy "Users can view their own achievement images"
  on storage.objects for select
  using (bucket_id = 'achievements' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Users can delete their own achievement images" on storage.objects;
create policy "Users can delete their own achievement images"
  on storage.objects for delete
  using (bucket_id = 'achievements' and auth.uid()::text = (storage.foldername(name))[1]);
