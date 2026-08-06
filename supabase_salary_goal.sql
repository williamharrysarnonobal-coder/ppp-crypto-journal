-- Salary vs Trading Goal page settings — monthly salary, working days/hours,
-- and the AED/PHP FX rates. One jsonb column instead of five scalar columns
-- so adding another input later needs no further migration.
-- Shape: { "monthly_salary": 5000, "working_days": 21.75, "hours_per_day": 8,
--          "aed_per_usd": 3.6725, "php_per_usd": 60.93 }
alter table user_profile add column if not exists salary_settings jsonb;
