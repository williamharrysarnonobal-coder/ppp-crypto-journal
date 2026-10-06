-- READ-ONLY. Changes nothing.
--
-- Shows the numbers behind "Risk Amount ($)" for trades No. 227-231 (the app
-- numbers real trades by close date, oldest first), next to the setup each one
-- was journaled from. Risk Amount in the journal is |entry - SL| x quantity;
-- the calculator's is the setup's risk_amount. Comparing the two shows which
-- input differs: the entry (actual fill vs plan), the SL, or the quantity.
with real as (
  select t.*,
    row_number() over (
      order by coalesce(t.close_date, t.open_date) nulls last, t.open_date, t.position_id
    ) as app_no
  from trading_journal t
  where coalesce(t.is_paper, false) = false
)
select
  r.app_no                               as trade_no,
  r.symbol, r.trade_type, r.account,
  r.entry_price                          as journal_entry,
  s.entry_price                          as setup_entry,
  r.sl_price                             as journal_sl,
  s.sl_price                             as setup_sl,
  r.position_size                        as journal_qty,
  s.quantity                             as setup_qty,
  round((abs(r.entry_price - r.sl_price) * r.position_size)::numeric, 2) as journal_risk,
  round(s.risk_amount::numeric, 2)       as setup_risk,
  r.close_price, r.profit_loss, r.fee, r.exit_type,
  r.leverage                             as journal_leverage,
  s.leverage                             as setup_leverage,
  r.position_id
from real r
left join position_setups s on s.id = r.linked_setup_id
where r.app_no between 227 and 231
order by r.app_no;
