-- Storage bucket for pasted trade-setup screenshots (Calculator's Setup
-- Notes log). Each note entry can carry one pasted image alongside its
-- timestamp/text, stored as { ts, text, img } in position_setups.notes_log.

-- ============================================================
-- STORAGE SETUP (do this in the Supabase dashboard, not SQL editor):
-- 1. Go to Storage > New bucket
-- 2. Name it exactly:  setup-screenshots
-- 3. Leave "Public bucket" OFF (private — images are per-user)
-- 4. Optional: Restrict file size to ~10 MB, Restrict MIME types to image/*
-- ============================================================

drop policy if exists "Users can upload their own setup screenshots" on storage.objects;
create policy "Users can upload their own setup screenshots"
  on storage.objects for insert
  with check (bucket_id = 'setup-screenshots' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Users can view their own setup screenshots" on storage.objects;
create policy "Users can view their own setup screenshots"
  on storage.objects for select
  using (bucket_id = 'setup-screenshots' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Users can delete their own setup screenshots" on storage.objects;
create policy "Users can delete their own setup screenshots"
  on storage.objects for delete
  using (bucket_id = 'setup-screenshots' and auth.uid()::text = (storage.foldername(name))[1]);
