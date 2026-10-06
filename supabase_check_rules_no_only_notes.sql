-- READ-ONLY. Changes nothing.
--
-- Trades marked Rules Followed = No whose Trade Tags contain NO actual rule —
-- only notes (tags you added yourself, or the built-in observation tags).
-- Before the change, any tag you added counted as a broken rule and could turn
-- Rules Followed to No on its own.
--
-- A trade can still be No for another reason: a confluence score under the
-- bar. Check each one before changing it — open it in the journal and set
-- Rules Followed to Yes there if it was clean.
with rules(tag) as (values
  ('overleveraged'), ('moved stop loss'), ('removed stop loss'), ('moved take profit'),
  ('changing plan'), ('revenge trade'), ('fomo entry'), ('ignored no-trade decision'),
  ('against daily bias / htf bias'), ('non-bnb setup'), ('lack of confluence'),
  ('btc only'), ('ignored trend'), ('no scalping trade'), ('early tp'),
  ('be''d at prev high/low'), ('no cutloss 3mins breakout')
),
t as (
  select position_id, symbol, close_date, rules_followed, unfollowed_rules,
         array(select lower(btrim(x)) from unnest(regexp_split_to_array(coalesce(unfollowed_rules, ''), '[,;]')) x
               where btrim(x) <> '') as tags
  from trading_journal
  where coalesce(is_paper, false) = false
    and lower(btrim(coalesce(rules_followed, ''))) = 'no'
)
select position_id, symbol, close_date, unfollowed_rules
from t
where cardinality(tags) > 0
  and not exists (select 1 from rules r where r.tag = any(t.tags))
order by close_date desc;
