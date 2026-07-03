-- Insert your two real Upscale Trade accounts.
-- NOTE: this runs from the SQL editor (no logged-in browser session), so
-- auth.uid() would be NULL there — we look up your user_id by email instead.
-- Replace the email below if you log into the app with a different one.

insert into trading_accounts
  (user_id, account_name, prop_firm, account_size, phase, max_daily_loss_pct, max_total_drawdown_pct, profit_target_pct, min_trading_days, consistency_rule_pct)
values
  (
    (select id from auth.users where email = 'williamharry.s.arnonobal@gmail.com'),
    'Upscale Trade 50K', 'Upscale Trade', 50000, 'Evaluation Phase 1',
    5, 10, 5, null, null
  ),
  (
    (select id from auth.users where email = 'williamharry.s.arnonobal@gmail.com'),
    'Upscale Trade 10K', 'Upscale Trade', 10000, 'Evaluation Phase 2',
    5, 10, 8, null, null
  );
