-- Non-destructive migration: lets an account carry its Upscale API link.
--
--   upscale_api_key_enc  the API key, AES-GCM encrypted by the Worker before it
--                        is ever stored. Never plaintext, never sent back to the
--                        browser — only the Worker (which holds the encryption
--                        key as a Cloudflare secret) can read it.
--   upscale_account_id   the Upscale account (UUID) this journal account trades.
--   upscale_account_label  a short description shown in the app, e.g.
--                        "$10,000 · Evaluation". Not secret.
--
-- Rows stay protected by the existing per-user RLS on trading_accounts.
alter table trading_accounts add column if not exists upscale_api_key_enc text;
alter table trading_accounts add column if not exists upscale_account_id text;
alter table trading_accounts add column if not exists upscale_account_label text;
