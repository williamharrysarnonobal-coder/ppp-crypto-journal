-- Per-user feature permissions, on top of the existing approve/reject gate.
-- disabled_features lists which nav views a specific approved user is NOT
-- allowed to use (empty array = full access, the default, so every
-- existing approved user keeps working exactly as before). The client
-- still SHOWS every nav item to everyone — a disabled one just renders
-- locked and blocks the click with a permission message, per the app
-- owner's request that people see what exists but can't silently guess
-- why it's missing.

alter table user_access add column if not exists disabled_features text[] not null default '{}';

-- Every approved user can read their OWN disabled_features (already covered
-- by the existing "select own access row or admin sees all" policy — no
-- change needed there). Only admins can change it — already covered by the
-- existing "only admin can update access rows" policy for the same reason.
