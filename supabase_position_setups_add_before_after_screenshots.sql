-- Non-destructive migration: adds two dedicated screenshot slots to
-- position_setups — before_screenshot and after_screenshot — instead of
-- attaching images to individual notes_log entries. Each is a single
-- storage path, replaced (not accumulated) each time you paste a new one.

alter table position_setups add column if not exists before_screenshot text;
alter table position_setups add column if not exists after_screenshot text;
