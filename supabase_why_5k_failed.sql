-- ============================================================
--  Bakit biglang FAILED ang Upscale Trade 5K?
--
--  Awtomatiko itong minamarkahan ng app kapag may nalabag na
--  sariling panuntunan ng account. Dalawa lang ang posible:
--
--    1. MAX DAILY LOSS  — may isang araw na ang kabuuang P&L ay
--                         umabot sa -5% ng $5,000 = -$250.00
--    2. MAX DRAWDOWN    — ang current_balance ay bumaba sa
--                         $4,500.00 (10% ng $5,000)
--
--  Ang #2 ay hindi maaari: $5,000.00 ang balanse mo. Kaya ang
--  #1 ang nangyari, at ang tanong ay ALING ARAW.
--
--  Mahalaga: ang balanse ay MANWAL (current_balance), habang ang
--  araw-araw na P&L ay galing sa mga naitalang trade. Dalawang
--  magkaibang pinagmulan — kaya normal na "+$0" ang kabuuan at
--  may isang araw pa ring lumagpas.
--
--  BASA LAMANG ang 1-4. Nasa dulo ang pagbawi, naka-comment.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ANG ARAW-ARAW NA P&L — alin ang lumagpas?
--
--    Sa UTC ang araw, hindi sa oras mo (UTC+4) — 24/7 ang crypto,
--    kaya UTC midnight ang paglipat. Ang trade mong sarado ng
--    ala-1 ng umaga sa Dubai ay kabilang sa NAKARAANG araw sa UTC.
-- ------------------------------------------------------------
--    Hiwalay ang P&L at ang FEE dahil BINABAWAS ang fee bago ihambing sa
--    -$250. Ang isang araw na patas ang mga trade pero may malaking fee ay
--    lumalagpas pa rin — at iyon ay mahirap mapansin.
select
  (close_date at time zone 'UTC')::date            as araw_utc,
  count(*)                                         as trades,
  round(sum(coalesce(profit_loss,0))::numeric, 2)  as pl_bago_ang_fee,
  round(sum(coalesce(fee,0))::numeric, 2)          as kabuuang_fee,
  round(sum(coalesce(profit_loss,0) - coalesce(fee,0))::numeric, 2) as pl_net,
  case
    when sum(coalesce(profit_loss,0) - coalesce(fee,0)) <= -250
      then case
        when sum(coalesce(profit_loss,0)) > -250
          then '<<< LUMAGPAS — ANG FEE ANG NAGBUHAT'
        else '<<< LUMAGPAS — ito ang nagpa-FAILED'
      end
    else ''
  end                                              as hatol
from trading_journal
where account = 'Upscale Trade 5K'
  and close_date is not null
  and coalesce(is_paper, false) = false
  -- Ang app ay binibilang LAMANG ang mga trade mula sa simula ng phase.
  -- Ang phase mo ay nagsimula 2026-09-02, kaya ito rin ang saklaw dito —
  -- kung wala kang makikita sa ibaba, wala ring nakikita ang app, at ibang
  -- bagay ang nagpa-Failed.
  and close_date >= '2026-09-02'
group by 1
order by pl_net asc;


-- ------------------------------------------------------------
-- 2. ANG MGA TRADE SA ARAW NA IYON
--
--    Palitan ang petsa ng lumabas sa itaas. Dito makikita kung
--    tunay ngang isang araw iyon — o kung maraming araw na
--    nagkataong iisa ang close_date (nangyayari iyon sa bulk
--    journal kung hindi naitama ang petsa).
-- ------------------------------------------------------------
select
  no, position_id, symbol,
  open_date, close_date,
  win_loss, profit_loss, fee,
  round((coalesce(profit_loss,0) - coalesce(fee,0))::numeric, 2) as net
from trading_journal
where account = 'Upscale Trade 5K'
  and (close_date at time zone 'UTC')::date = '2026-09-02'   -- <== palitan
  and coalesce(is_paper, false) = false
order by close_date;


-- ------------------------------------------------------------
-- 3. MAY TRADE BA NA IISA ANG CLOSE DATE?
--
--    Kung maraming trade ang eksaktong pareho ang close_date
--    hanggang sa segundo, malamang hindi sila naitama pagkatapos
--    ng bulk journal — at nagkukumpol sila sa isang araw na
--    hindi naman talaga nangyari sa isang araw.
-- ------------------------------------------------------------
select
  close_date,
  count(*) as trades_na_magkapareho,
  round(sum(coalesce(profit_loss,0) - coalesce(fee,0))::numeric, 2) as pl_net
from trading_journal
where account = 'Upscale Trade 5K'
  and close_date is not null
  and coalesce(is_paper, false) = false
group by close_date
having count(*) > 1
order by trades_na_magkapareho desc;


-- ------------------------------------------------------------
-- 4. ANG PANUNTUNAN MISMO NG ACCOUNT
--
--    Kumpirmahin kung 5% nga ang max_daily_loss_pct. Kung mas
--    mababa ang nakalagay (halimbawa 2%), ang hangganan ay $100
--    at mas madaling lumagpas kaysa sa inaasahan mo.
-- ------------------------------------------------------------
select
  account_name, account_size, status,
  max_daily_loss_pct,
  round((account_size * max_daily_loss_pct / 100)::numeric, 2) as daily_loss_limit,
  max_total_drawdown_pct,
  round((account_size - account_size * max_total_drawdown_pct / 100)::numeric, 2) as drawdown_floor,
  current_balance,
  phase_start_date, phase_start_balance
from trading_accounts
where account_name = 'Upscale Trade 5K';


-- ============================================================
--  PAGBAWI — kung mali ang pagka-FAILED
--
--  Alisin ang comment sa isa lang sa dalawa sa ibaba.
--  Hindi na ito babalik sa Failed hangga't hindi mo inaayos ang
--  trade na nagdulot nito: sa bawat pagbukas ng app, muling
--  sinusuri ito, at kung nandoon pa rin ang -$250 na araw ay
--  agad itong maga-Failed ulit.
--
--  Kaya: ayusin muna ang petsa ng mga trade (kung iyon ang
--  sanhi), bago ibalik ang status.
-- ============================================================

-- update trading_accounts set status = 'Ongoing'
--   where account_name = 'Upscale Trade 5K';

-- Kung ang sanhi ay magkakapatong na close_date mula sa bulk
-- journal, itama muna ang mga petsa — isa-isa, gamit ang
-- position_id na lumabas sa query #2:
-- update trading_journal set close_date = '2026-09-03 14:30:00+00'
--   where position_id = 'WEB-XXXXXXXX';
