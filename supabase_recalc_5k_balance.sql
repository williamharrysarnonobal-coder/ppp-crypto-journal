-- ============================================================
--  Ibalik ang balanse ng Upscale Trade 5K mula sa mga trade mo
--
--  Nireset ng lumang auto-advance ang current_balance sa laki ng
--  account ($5,000) at nabura ang tunay na numero. Ang naunang SQL
--  ay may 5000 na placeholder na dapat mong palitan — hindi iyon
--  napalitan, kaya +$0 pa rin ang lumalabas.
--
--  Isang pahayag ito. Walang numerong kokopyahin: kinukuha nito ang
--  kabuuan mismo sa journal mo.
--
--  ANG BROKER PA RIN ANG AWTORIDAD. Kung may trade kang hindi
--  naitala, mas mababa ang lalabas dito kaysa sa totoo — kaya
--  ihambing mo sa Upscale bago ka umalis dito.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TINGNAN MUNA — ano ang ilalagay nito
-- ------------------------------------------------------------
select
  a.account_name,
  a.account_size                                   as panimula,
  count(j.*)                                       as closed_trades,
  round(sum(coalesce(j.profit_loss,0))::numeric, 2)     as pl,
  round(sum(coalesce(j.fee,0))::numeric, 2)             as fees,
  a.current_balance                                as balanse_ngayon,
  round((a.account_size + coalesce(sum(coalesce(j.profit_loss,0)
        - coalesce(j.fee,0)), 0))::numeric, 2)     as bagong_balanse
from trading_accounts a
left join trading_journal j
  on j.account = a.account_name
 and coalesce(j.is_paper, false) = false
 and j.close_date is not null
where a.account_name = 'Upscale Trade 5K'
group by a.account_name, a.account_size, a.current_balance;


-- ------------------------------------------------------------
-- 2. ISULAT — alisin ang comment kapag tama na ang nasa itaas
-- ------------------------------------------------------------
-- update trading_accounts a
--   set current_balance = a.account_size + coalesce((
--         select sum(coalesce(j.profit_loss,0) - coalesce(j.fee,0))
--         from trading_journal j
--         where j.account = a.account_name
--           and coalesce(j.is_paper, false) = false
--           and j.close_date is not null), 0)
--   where a.account_name = 'Upscale Trade 5K';


-- ------------------------------------------------------------
--  Hindi mo na kailangan ang SQL na ito sa susunod.
--
--  May pindutan na sa Edit account, katabi ng Current Balance:
--  "Recalculate from my trades". Ipinapakita muna nito ang bilang
--  bago punan ang kahon, at ikaw pa rin ang pipindot ng Save.
-- ------------------------------------------------------------
