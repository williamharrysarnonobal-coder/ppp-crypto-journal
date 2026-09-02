-- ============================================================
--  Bakit bumagsak ang isang account
--
--  Ang status ay "Failed" lamang noon — walang naitatalang dahilan.
--  Pagkalipas ng ilang buwan, wala ka nang paraan para malaman kung
--  daily loss ba iyon o drawdown, aling araw, at kung ang sumira ay
--  isang tunay na trade o isang maling naitalang petsa.
--
--  Ligtas patakbuhin nang paulit-ulit.
-- ============================================================

alter table trading_accounts
  add column if not exists fail_reason text;

comment on column trading_accounts.fail_reason is
  'Bakit minarkahang Failed ang account na ito — ang mismong pangungusap na '
  'ipinakita sa babala, kasama ang petsa. Isinusulat ng markAccountFailed(). '
  'NULL sa mga account na bumagsak bago pa itinala ang mga dahilan.';


-- ------------------------------------------------------------
--  Ang Upscale Trade 5K
--
--  Minarkahang Failed ito ng lumang auto-fail, na nagbabasa ng
--  araw-araw na P&L ng mga naitalang trade habang ang balanse mo ay
--  nananatiling $5,000. Sabi ng Upscale ay hindi ito bumagsak.
--
--  Hindi na ito babalik sa Failed nang kusa: hindi na nagsusulat ang
--  app — nagbababala na lang ito at ikaw ang pipindot.
-- ------------------------------------------------------------

-- Tingnan muna kung ano ang kalagayan ngayon:
select account_name, status, fail_reason, current_balance
from trading_accounts
where account_name = 'Upscale Trade 5K';

-- Ibalik sa Ongoing. Alisin ang comment kapag handa ka na:
-- update trading_accounts
--   set status = 'Ongoing', fail_reason = null
--   where account_name = 'Upscale Trade 5K';
