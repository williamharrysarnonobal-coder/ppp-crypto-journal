-- Updates your two accounts with current balance + start date.
-- Run supabase_trading_accounts_add_balance.sql and
-- supabase_trading_accounts_add_start_date.sql first if you haven't already.

update trading_accounts
set current_balance = 50273.85, start_date = '2026-06-29'
where account_name = 'Upscale Trade 50K';

update trading_accounts
set current_balance = 9993.1, start_date = '2026-06-13'
where account_name = 'Upscale Trade 10K';
