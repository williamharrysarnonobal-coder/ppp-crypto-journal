-- Non-destructive migration: remembers the Upscale order a setup placed, so the
-- Pending Setups table can cancel it.
--
--   upscale_order_id  the order id Upscale returned (UUID). Not secret — it is
--                     useless without the API key, which stays encrypted on
--                     trading_accounts and is only ever read by the Worker.
alter table position_setups add column if not exists upscale_order_id text;
