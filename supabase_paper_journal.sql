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

-- Ang tanong na sinasagot ng buong pahina ay "bakit ako hindi pumipindot", at
-- ang sagot ay hinahanap sa mga paper trade lang. Ang index ay nagpapabilis
-- doon at hindi hinahawakan ang mga tunay na trade.
create index if not exists trading_journal_is_paper_idx
  on trading_journal (user_id, is_paper)
  where is_paper = true;

-- Suriin: dapat zero ang bilang bago ka magsimula, at dapat walang tunay na
-- trade na naging paper.
--   select is_paper, count(*) from trading_journal group by is_paper;
