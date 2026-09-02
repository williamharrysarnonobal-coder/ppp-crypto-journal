-- Ang mga trade na nasa Trade Journals pero dapat nasa Paper Trade Journal
--
-- BASAHIN MUNA ANG BUONG FILE BAGO PATAKBUHIN. Ang unang bahagi ay TUMITINGIN
-- lamang; ang huling bahagi ay NAGBABAGO ng datos at naka-komento nang sadya.
--
--
-- PAANO SILA NAKALUSOT
--
-- Ang _drawerIsPaper() ay tumitingin sa KINAROROONAN ng calculator at hindi sa
-- trade mismo. Habang bukas ang Paper Trade Journal, ang pagbukas ng isang
-- TUNAY na trade ay nagpapakita rito ng mga tanong ng paper — "Why you did not
-- take it" at "What would have happened" — at kung na-save mo iyon, naisulat
-- ang mga sagot sa isang tunay na trade.
--
-- Ang is_paper ay hindi nagbabago sa pag-update (sa PAGGAWA lang ito
-- isinusulat), kaya nanatiling tunay ang trade habang may dalang sagot na para
-- lamang sa paper. Iyon ang lagda na hinahanap ng query sa ibaba.
--
-- Naayos na ang sanhi sa dashboard.js — ang trade na may position_id ay ang
-- sarili nitong is_paper ang katotohanan, hindi ang pahinang binubuksan mo.
-- Ang file na ito ay para sa mga naunang nailagay.


-- ============================================================
-- 1. TINGNAN. Walang binabago. Patakbuhin ito muna.
-- ============================================================

select
  position_id,
  close_date,
  symbol,
  win_loss,
  profit_loss,
  no_trade_reason,
  paper_outcome,
  case
    -- Walang resulta at walang perang gumalaw: halos tiyak na hindi ito
    -- pinasok kailanman.
    when (win_loss is null or win_loss = '')
     and (profit_loss is null or profit_loss = 0) then 'malamang PAPER'
    -- May resulta at may pera: isang tunay na trade na nadikitan ng sagot.
    -- Ang tamang ayos dito ay ang pagbura ng dalawang field, HINDI ang
    -- paglipat — may pera itong gumalaw sa account mo.
    else 'TUNAY, maling sagot lang'
  end as hatol
from trading_journal
where coalesce(is_paper, false) = false
  and (
    (no_trade_reason is not null and no_trade_reason <> '')
    or (paper_outcome is not null and paper_outcome <> '')
  )
order by close_date desc nulls last;


-- ============================================================
-- 2. ILANG ANG APEKTADO, AT ANONG URI
-- ============================================================

select
  case
    when (win_loss is null or win_loss = '')
     and (profit_loss is null or profit_loss = 0) then 'malamang PAPER'
    else 'TUNAY, maling sagot lang'
  end as hatol,
  count(*)
from trading_journal
where coalesce(is_paper, false) = false
  and (
    (no_trade_reason is not null and no_trade_reason <> '')
    or (paper_outcome is not null and paper_outcome <> '')
  )
group by 1;


-- ============================================================
-- 3. ANG PAG-AAYOS. Naka-komento — alisin lamang ang komento sa
--    bahaging TUMUTUGMA sa nakita mo sa itaas.
-- ============================================================
--
-- 3a. ANG WALANG RESULTA AT WALANG PERA -> ilipat sa Paper Trade Journal.
--
--     Ang dalawang kondisyong ito ay hindi pampaganda: ang trade na may
--     profit_loss ay gumalaw ng pera sa isang account, at ang paglipat noon sa
--     paper ay magbabago sa balanse ng account mo nang walang anumang tala
--     kung bakit. Hindi ito hinahawakan ng query na ito.
--
-- update trading_journal
--    set is_paper = true,
--        -- Ang mga field na walang kahulugan sa isang setup na hindi
--        -- nangyari. Nililinis para hindi sila lumitaw sa Paper Journal
--        -- bilang datos na hindi naman totoo.
--        account = null,
--        account_type = null,
--        position_size = null,
--        leverage = null,
--        close_date = null,
--        close_price = null,
--        profit_loss = null,
--        pnl_percent = null,
--        fee = null,
--        win_loss = null,
--        exit_type = null,
--        post_be_result = null,
--        post_cutloss_result = null,
--        rules_followed = null,
--        unfollowed_rules = null
--  where coalesce(is_paper, false) = false
--    and (
--      (no_trade_reason is not null and no_trade_reason <> '')
--      or (paper_outcome is not null and paper_outcome <> '')
--    )
--    and (win_loss is null or win_loss = '')
--    and (profit_loss is null or profit_loss = 0);
--
--
-- 3b. ANG MAY RESULTA AT MAY PERA -> tunay na trade ito; burahin lamang ang
--     dalawang sagot na hindi dapat naroon.
--
-- update trading_journal
--    set no_trade_reason = null,
--        paper_outcome = null
--  where coalesce(is_paper, false) = false
--    and (
--      (no_trade_reason is not null and no_trade_reason <> '')
--      or (paper_outcome is not null and paper_outcome <> '')
--    )
--    and (win_loss is not null and win_loss <> ''
--         or (profit_loss is not null and profit_loss <> 0));


-- ============================================================
-- 4. PAGKATAPOS: dapat zero ang bilang.
-- ============================================================
--
-- select count(*) from trading_journal
--  where coalesce(is_paper, false) = false
--    and (no_trade_reason is not null and no_trade_reason <> ''
--         or paper_outcome is not null and paper_outcome <> '');
