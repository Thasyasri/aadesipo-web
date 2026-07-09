-- Disconnect handling: if the player whose turn it is closes their tab and never
-- comes back, nobody else can act (the engine rejects any action from a seat
-- that isn't the acting one), so the game deadlocks forever. 0002 added
-- room_players.last_seen_at for this and nothing ever wrote it.
--
-- Presence does NOT belong on room_players. 0008 deliberately froze that table
-- once a game starts, because validate-action derives turn order from it live —
-- a writable seat row is a writable turn order. Presence is a separate concern
-- with a separate lifetime, so it gets its own table.
--
-- The takeover itself runs in the advance-turn Edge Function (service_role): a
-- client may never insert an action on another seat's behalf, so there is no
-- client-facing policy for it here.

create table if not exists room_presence (
  room_id uuid not null references rooms (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table room_presence enable row level security;

-- Everyone in the game needs to see who has gone quiet, to offer the takeover.
create policy "room_presence is readable by any authenticated user"
  on room_presence for select
  to authenticated
  using (true);

create policy "players heartbeat their own presence"
  on room_presence for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "players update their own presence"
  on room_presence for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Superseded by room_presence above; never written, keep it from misleading.
comment on column room_players.last_seen_at is
  'Deprecated, always null. Presence lives in room_presence (see 0010).';
