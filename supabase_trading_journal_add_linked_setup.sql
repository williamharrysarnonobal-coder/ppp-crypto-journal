-- Non-destructive migration: links a trading_journal row back to the
-- position_setups row it was Journaled from (if any). Lets deleting the
-- trade automatically flip that saved setup's Status back to "Pending" so
-- it can be re-journaled, instead of staying stuck on "Journaled" forever.

alter table trading_journal add column if not exists linked_setup_id bigint references position_setups(id) on delete set null;
