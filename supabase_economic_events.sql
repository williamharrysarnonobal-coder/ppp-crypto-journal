-- Economic calendar events — shared data (not per-user), fetched by a Python
-- bot from a public calendar feed and upserted here. The dashboard reads
-- this table to build its own Calendar (left) + Details (right) view,
-- replacing the old TradingView iframe embed (which we can't read text out
-- of — it's a cross-origin widget).

drop table if exists economic_events;

create table economic_events (
  id bigint generated always as identity primary key,
  title text not null,
  country text,               -- currency code, e.g. "USD", "EUR", "JPY"
  event_date timestamptz not null,
  impact text,                 -- "Low" | "Medium" | "High" | "Holiday"
  forecast text,
  previous text,
  actual text,
  comment text,                -- what the indicator measures/means (from the source, when available)
  comment_tl text,             -- Tagalog translation of "comment", cached so we don't re-translate repeats
  created_at timestamptz not null default now(),
  unique (title, country, event_date)
);

alter table economic_events enable row level security;

-- Any logged-in user can read — this isn't per-user data.
create policy "select economic events"
  on economic_events for select
  using (auth.uid() is not null);

-- No insert/update policy for regular users — only the bot's secret key
-- (which bypasses RLS) writes to this table.
