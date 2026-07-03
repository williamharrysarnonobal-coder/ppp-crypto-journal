-- Trader profile: one row per user, private (same isolation model as
-- trading_journal / achievements). Includes the "inspiration board" image path.

drop table if exists user_profile;

create table user_profile (
  user_id uuid primary key references auth.users(id) default auth.uid(),
  display_name text,
  trading_style text,
  primary_market text,
  risk_per_trade numeric,
  trading_rules jsonb not null default '[]'::jsonb,
  my_why text,
  inspiration_image_path text,
  updated_at timestamptz not null default now()
);

alter table user_profile enable row level security;

create policy "select own profile"
  on user_profile for select
  using (auth.uid() = user_id);

create policy "insert own profile"
  on user_profile for insert
  with check (auth.uid() = user_id);

create policy "update own profile"
  on user_profile for update
  using (auth.uid() = user_id);


-- ============================================================
-- STORAGE SETUP (do this in the Supabase dashboard, not SQL editor):
-- 1. Go to Storage > New bucket
-- 2. Name it exactly:  profile-images
-- 3. Leave "Public bucket" OFF (private — images are per-user)
-- 4. Optional: Restrict file size to ~10 MB, Restrict MIME types to image/*
--    (the inspiration board image can be a large poster-style graphic)
-- ============================================================

drop policy if exists "Users can upload their own profile images" on storage.objects;
create policy "Users can upload their own profile images"
  on storage.objects for insert
  with check (bucket_id = 'profile-images' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Users can view their own profile images" on storage.objects;
create policy "Users can view their own profile images"
  on storage.objects for select
  using (bucket_id = 'profile-images' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Users can delete their own profile images" on storage.objects;
create policy "Users can delete their own profile images"
  on storage.objects for delete
  using (bucket_id = 'profile-images' and auth.uid()::text = (storage.foldername(name))[1]);
