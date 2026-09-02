-- ============================================================
--  Ibalik sa dati ang Upscale Trade 5K
--
--  Kusang inakyat ito ng app sa "Evaluation Phase 2" noong Sep 2:
--  naabot ng natitipon ang target, kaya nag-reset ito ng balanse sa
--  $5,000 at nagtakda ng bagong phase_start_date. Dahil doon, ang
--  bawat numero sa card ay bumalik sa zero — 33 trades katabi ng +$0.
--
--  Hindi na ito uulit: nagbababala na lang ang app at may pindutan
--  ka na sa card. Ang naisulat na noon ay kailangan pang bawiin nang
--  isang beses, at ito iyon.
--
--  BASA MUNA ang #1 bago patakbuhin ang #2.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ANO ANG KALAGAYAN NGAYON
-- ------------------------------------------------------------
select
  account_name, phase, status,
  phase_start_date, phase_start_balance,
  current_balance, account_size, profit_target_pct
from trading_accounts
where account_name = 'Upscale Trade 5K';


-- ------------------------------------------------------------
-- 2. ANG TUNAY NA BALANSE
--
--    Ang balanse ay MANWAL — hindi ito kinukuwenta mula sa journal
--    nang sadya, dahil ang broker ang awtoridad doon at hindi lahat
--    ay laging naitatala. Ito ang sinasabi ng journal mo, para may
--    maihahambing ka sa nasa Upscale:
-- ------------------------------------------------------------
select
  count(*)                                                     as trades,
  round(sum(coalesce(profit_loss,0) - coalesce(fee,0))::numeric, 2) as pl_net,
  round((5000 + sum(coalesce(profit_loss,0) - coalesce(fee,0)))::numeric, 2)
                                                               as balanse_ayon_sa_journal
from trading_journal
where account = 'Upscale Trade 5K'
  and coalesce(is_paper, false) = false
  and close_date is not null;


-- ------------------------------------------------------------
-- 3. IBALIK SA PHASE 1
--
--    Ang `phase_start_date = null` ang nagpapabalik sa card sa
--    pagbibilang ng LAHAT ng trade mo sa account na ito, hindi lang
--    ang mula Sep 2.
--
--    Palitan ang 5000 sa ibaba ng TUNAY na balanse sa Upscale —
--    o ng "balanse_ayon_sa_journal" sa itaas kung tugma sila.
-- ------------------------------------------------------------
update trading_accounts set
  phase               = 'Evaluation Phase 1',
  phase_start_date    = null,
  phase_start_balance = null,
  current_balance     = 5000        -- <== palitan ng totoong balanse
where account_name = 'Upscale Trade 5K';


-- ------------------------------------------------------------
-- 4. KUMPIRMAHIN
-- ------------------------------------------------------------
select account_name, phase, status, phase_start_date,
       phase_start_balance, current_balance
from trading_accounts
where account_name = 'Upscale Trade 5K';
