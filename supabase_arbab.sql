-- ARBAB (2026-11-26): the in-app assistant, built like the MPD IT Console's ANGE.
-- No paid API: your message is saved here, a watcher on the office laptop
-- (arbab/wait-msg.cjs, run by the Claude Code session in VS Code) picks it up,
-- and the answer is written back by arbab/reply.cjs with the service_role key.
-- Run once in the Supabase SQL Editor.

create table if not exists arbab_messages (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'arbab')),
  text text not null default '',
  image_path text,                     -- in the private profile-images bucket: {user_id}/arbab/...
  progress boolean not null default false,  -- a "working on it" note, not the final answer
  created_at timestamptz not null default now()
);
create index if not exists arbab_messages_user_id_idx on arbab_messages (user_id, id);

alter table arbab_messages enable row level security;

-- You read your own conversation and can only write YOUR messages; ARBAB's
-- answers come from the laptop with the service_role key (bypasses RLS).
drop policy if exists "own arbab select" on arbab_messages;
create policy "own arbab select" on arbab_messages for select
  using (auth.uid() = user_id and is_approved_user());
drop policy if exists "own arbab insert" on arbab_messages;
create policy "own arbab insert" on arbab_messages for insert
  with check (auth.uid() = user_id and role = 'user' and progress = false and is_approved_user());
drop policy if exists "own arbab delete" on arbab_messages;
create policy "own arbab delete" on arbab_messages for delete
  using (auth.uid() = user_id and is_approved_user());

-- Online status, like ANGE: beat_at = the VS Code session is alive,
-- listen_at = the watcher is waiting (Claude is free), seen_id = last message picked up.
create table if not exists arbab_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seen_id bigint not null default 0,
  beat_at timestamptz,
  listen_at timestamptz
);

alter table arbab_state enable row level security;

drop policy if exists "own arbab state select" on arbab_state;
create policy "own arbab state select" on arbab_state for select
  using (auth.uid() = user_id and is_approved_user());
-- Only the laptop (service_role) writes it.
