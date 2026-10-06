-- Sets Max Leverage to 25 on The5ers accounts (High Stakes: 1:25 on metals and
-- indices). Only touches accounts whose prop firm is The5ers.
--
-- The first query shows what will change; the update does it; the last query
-- shows the result.
select id, account_name, prop_firm, challenge_type, max_leverage
from trading_accounts
where prop_firm = 'The5ers';

update trading_accounts
   set max_leverage = 25
 where prop_firm = 'The5ers';

select id, account_name, prop_firm, challenge_type, max_leverage
from trading_accounts
where prop_firm = 'The5ers';
