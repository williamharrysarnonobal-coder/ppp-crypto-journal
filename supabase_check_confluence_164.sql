-- ============================================================
--  Bakit "—" ang Confluence Score ng 164, 165, 166?
--
--  Tatlong magkaibang sanhi ang nagbibigay ng parehong "—", at
--  hindi ko sila mapaghihiwalay sa screenshot. Ito ang naghihiwalay.
--  BASA LAMANG — walang binabago rito.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ANG TATLONG TRADE MISMO
--
--    linked_setup_id  = may kawing ba sa setup na pinanggalingan?
--                       Kung NULL, hindi kailanman nakuha ng bulk ang
--                       setup, at walang mapagkukunan ng confluence.
--    confluence_answers = ano ba talaga ang nakasulat?
--                       '{}' ay IBA sa NULL: ang '{}' ay nangangahulugang
--                       may dumaan pero walang laman.
-- ------------------------------------------------------------
select
  no,
  position_id,
  open_date::date          as petsa,
  pattern_type,
  linked_setup_id,
  case
    when confluence_answers is null      then 'NULL — walang dumaan'
    when confluence_answers::text = '{}' then 'WALANG LAMAN {} — dumaan pero blangko'
    else (select count(*)::text from jsonb_object_keys(confluence_answers::jsonb))
         || ' sagot'
  end                                    as confluence,
  confluence_answers
from trading_journal
where no in (164, 165, 166)
order by no;


-- ------------------------------------------------------------
-- 2. ANG SETUP NA PINANGGALINGAN
--
--    Dito lalabas ang sagot. Kung may laman ang confluence_answers
--    ng SETUP pero walang laman sa TRADE, may nabitiwan sa paglipat.
--    Kung parehong walang laman, hindi talaga na-save ang sagot mo —
--    at ang pattern_type na may laman ang dahilan kung bakit mukhang
--    tapos ang setup na iyon.
-- ------------------------------------------------------------
select
  s.id                                          as setup_id,
  s.account_name,
  s.pattern_type                                as pattern_ng_setup,
  t.pattern_type                                as pattern_ng_trade,
  case when s.pattern_type is distinct from t.pattern_type
       then 'NAGBAGO — dito binubura ang confluence'
       else 'pareho' end                        as pattern,
  (select count(*) from jsonb_object_keys(coalesce(s.confluence_answers,'{}')::jsonb))
                                                as sagot_sa_setup,
  (select count(*) from jsonb_object_keys(coalesce(t.confluence_answers,'{}')::jsonb))
                                                as sagot_sa_trade,
  s.status
from trading_journal t
join position_setups s on s.id = t.linked_setup_id
where t.no in (164, 165, 166)
order by t.no;


-- ------------------------------------------------------------
-- 3. GAANO KALAWAK? — lahat ng setup mo
--
--    Ang hanay na "may pattern pero walang sagot" ang mismong butas:
--    mukhang tapos sila sa listahan (nakasulat na "Edit Confluence",
--    gumagana ang Journal) pero walang dadalhin sa trade.
-- ------------------------------------------------------------
select
  case
    when confluence_answers is null or confluence_answers::text = '{}'
      then case when pattern_type is not null
                then 'may pattern PERO WALANG SAGOT  <-- ang butas'
                else 'wala pang confluence' end
    else 'may sagot'
  end                              as kalagayan,
  count(*)                         as bilang
from position_setups
group by 1
order by 2 desc;


-- ------------------------------------------------------------
-- 4. Ilang trade ang naapektuhan sa kabuuan?
-- ------------------------------------------------------------
select
  count(*) filter (where confluence_answers is null)                as walang_confluence,
  count(*) filter (where confluence_answers::text = '{}')           as blangkong_confluence,
  count(*) filter (where confluence_answers is not null
                     and confluence_answers::text <> '{}')          as may_confluence,
  count(*) filter (where linked_setup_id is null)                   as walang_kawing_sa_setup,
  count(*)                                                          as lahat
from trading_journal
where coalesce(is_paper, false) = false;
