-- READ-ONLY. Changes nothing.
--
-- Lists every trade whose STORED session differs from the session the app now
-- shows. The old calculation used fixed Dubai hours (London = 12pm-5pm) and
-- ignored daylight saving, so from March to October it called the 11am hour
-- "Asia" when London was already open.
--
-- The app no longer reads the stored value — it works the session out from the
-- open date every time — so these rows already show correctly on the dashboard.
-- This is only so you can see which trades were affected.
--
-- Session rules (each market's own clock, so daylight saving is automatic):
--   London    08:00-17:00 London time
--   New York  08:00-17:00 New York time
--   Overlap   when both are open
--   Asia      09:00-18:00 Tokyo time, until London opens
--   Low Liquidity  everything else
with t as (
  select
    position_id, symbol, is_paper, session as stored_session, open_date,
    -- A date saved without a timezone was typed in Dubai time.
    case when open_date::text ~ '[+-]\d\d(:\d\d)?$'
         then open_date::text::timestamptz
         else open_date::text::timestamp at time zone 'Asia/Dubai'
    end as opened
  from trading_journal
  where open_date is not null
),
h as (
  select *,
    extract(hour from opened at time zone 'Europe/London')    + extract(minute from opened at time zone 'Europe/London')    / 60.0 as lon,
    extract(hour from opened at time zone 'America/New_York') + extract(minute from opened at time zone 'America/New_York') / 60.0 as ny,
    extract(hour from opened at time zone 'Asia/Tokyo')       + extract(minute from opened at time zone 'Asia/Tokyo')       / 60.0 as tky
  from t
),
s as (
  select *,
    case
      when lon >= 8 and lon < 17 and ny >= 8 and ny < 17 then 'London + NY Overlap'
      when lon >= 8 and lon < 17                          then 'London'
      when ny  >= 8 and ny  < 17                          then 'New York'
      when tky >= 9 and tky < 18                          then 'Asia'
      else 'Low Liquidity'
    end as correct_session
  from h
)
select
  position_id,
  symbol,
  case when is_paper then 'Paper' else 'Real' end as journal,
  to_char(opened at time zone 'Asia/Dubai', 'YYYY-MM-DD HH24:MI') as opened_dubai,
  stored_session,
  correct_session
from s
where coalesce(stored_session, '') <> correct_session
order by opened desc;
