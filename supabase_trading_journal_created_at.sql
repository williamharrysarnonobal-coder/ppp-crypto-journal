-- Kailan mo TALAGA isinulat ang trade
--
-- Ang close_date ay kung kailan nagsara ang trade. Ang created_at ay kung
-- kailan mo ito isinulat. Magkaibang bagay, at ang agwat sa pagitan nila ang
-- buong punto ng "Same-Day Journaling": ang trade na isinulat mo makalipas
-- ang tatlong linggo ay isinulat mula sa alaala, at ang alaala ay mabait sa
-- iyo sa paraang hindi ginagawa ng talaan.
--
-- ANG MAHALAGANG BAGAY TUNGKOL SA MGA LUMANG TRADE:
--
-- Ang bawat row na naroon na ay walang halaga rito. Maaari kong punuin sila ng
-- close_date at magmumukhang perpekto ang bawat isa — at magsisinungaling ang
-- bilang mo mula sa unang araw. Kaya iniiwan silang NULL, at hindi sila
-- binibilang ng challenge sa alinmang panig: hindi sila maagap at hindi rin
-- huli. Hindi naitala kung kailan mo sila isinulat, at hindi na iyon mababawi.
--
-- Sa zero ka magsisimula. Iyon ang tamang bilang.

alter table trading_journal
  add column if not exists created_at timestamptz default now();

-- Ang default ay tumatakbo lamang sa BAGONG row. Ang mga umiiral ay nananatiling
-- NULL nang sadya — huwag itong backfill-an.
--
-- Suriin: dapat zero ang may created_at bago ka magdagdag ng bagong trade.
--   select count(*) filter (where created_at is not null) as naitala,
--          count(*) filter (where created_at is null)     as luma
--   from trading_journal;
