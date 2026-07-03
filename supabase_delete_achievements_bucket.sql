-- Deletes the "achievements" storage bucket and everything inside it.
-- Run this only if you're sure the bucket is empty (or you don't mind
-- losing whatever's in it) — this cannot be undone.

delete from storage.objects where bucket_id = 'achievements';
delete from storage.buckets where id = 'achievements';
