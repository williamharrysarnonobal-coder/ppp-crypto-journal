-- Paper Trade Journal
--
-- Isang setup na hindi mo kinuha. May lahat itong detalye ng isang tunay na
-- trade maliban sa isa: hindi ito nangyari. Kaya dalawang column lang ang
-- kailangan sa umiiral na talahanayan — walang bagong talahanayan, walang
-- bagong RLS policy, at ang lahat ng nakasulat nang code na bumabasa ng
-- trading_journal ay patuloy na gagana.
--
-- Ang app ang naghahati: ang ALL_TRADES ay hindi kailanman naglalaman ng paper
-- trade, kaya ang P&L, ang win rate, ang salary goal at ang prop firm drawdown
-- ay hindi nagbabago. Tingnan ang _rebuildTradeArrays sa dashboard.js.
--
-- Patakbuhin ito sa Supabase SQL editor.

alter table trading_journal
  add column if not exists is_paper boolean not null default false;

alter table trading_journal
  add column if not exists no_trade_reason text;

-- Ano sana ang nangyari.
--
-- Ang dahilan ay nagsasabi kung BAKIT ka hindi pumasok. Ito ang nagsasabi kung
-- TAMA ka ba — at kung wala ito, ang buong pahina ay isang talaan ng takot na
-- walang paraan para malaman kung ang takot na iyon ay nagliligtas sa iyo o
-- nagpapamahal. 'Hit TP' · 'Hit SL' · 'Never filled' · 'Not checked yet'.
--
-- Walang historical na presyo sa database, kaya ikaw ang nagmamarka nito kapag
-- tiningnan mo ulit ang chart. Ang paghula nito ay mas masahol kaysa sa
-- pagtatanong.
alter table trading_journal
  add column if not exists paper_outcome text;

-- Ang tanong na sinasagot ng buong pahina ay "bakit ako hindi pumipindot", at
-- ang sagot ay hinahanap sa mga paper trade lang. Ang index ay nagpapabilis
-- doon at hindi hinahawakan ang mga tunay na trade.
create index if not exists trading_journal_is_paper_idx
  on trading_journal (user_id, is_paper)
  where is_paper = true;

-- Ang mga SETUP din.
--
-- Ang Position Size Calculator ay iisang bagay na may dalawang tahanan, kaya
-- ang Pending Setups sa loob nito ay iisang listahan — ang setup na ginawa mo
-- sa Paper Trade Journal ay lumalabas din sa tunay na calculator. Kailangan
-- din nito ng sariling watawat, dahil ang isang planong hindi mo kinuha ay
-- hindi dapat nakaupo sa listahan ng mga plano mong susundan.
alter table position_setups
  add column if not exists is_paper boolean not null default false;

create index if not exists position_setups_is_paper_idx
  on position_setups (user_id, is_paper)
  where is_paper = true;

-- Ang LEVERAGE.
--
-- Nasa position_setups ito mula pa noon pero wala sa trading_journal — kaya
-- ang leverage na BINALAK mo ay naitatala at ang GINAMIT mo ay hindi. Dalawang
-- trade na may parehong quantity pero magkaibang leverage ay magkaibang
-- panganib sa account, at hindi mo iyon makikita nang wala ito.
alter table trading_journal
  add column if not exists leverage numeric;

-- Suriin: dapat zero ang bilang bago ka magsimula, at dapat walang tunay na
-- trade na naging paper.
--   select is_paper, count(*) from trading_journal group by is_paper;
--   select is_paper, count(*) from position_setups  group by is_paper;
