-- Step 1: run this first to see exactly what "account" values your existing
-- trades use, and how many trades use each one.
select account, count(*) as trade_count
from trading_journal
group by account
order by trade_count desc;
