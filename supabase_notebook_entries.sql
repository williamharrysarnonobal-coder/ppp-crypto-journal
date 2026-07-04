-- Notebook: free-form trading notes (strategy thoughts, psychology reflections,
-- market thesis, trade post-mortems) — separate from the structured Trade
-- Journal. Private per-user, same isolation model as trading_journal.

drop table if exists notebook_entries;

create table notebook_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) default auth.uid(),
  title text not null,
  body text,
  tag text not null default 'General', -- 'Strategy' | 'Psychology' | 'Market Notes' | 'Trade Review' | 'Accounts' | 'General'
  linked_account_id bigint references trading_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table notebook_entries enable row level security;

create policy "select own notebook entries"
  on notebook_entries for select
  using (auth.uid() = user_id);

create policy "insert own notebook entries"
  on notebook_entries for insert
  with check (auth.uid() = user_id);

create policy "update own notebook entries"
  on notebook_entries for update
  using (auth.uid() = user_id);

create policy "delete own notebook entries"
  on notebook_entries for delete
  using (auth.uid() = user_id);
