-- AadesiPo initial schema (M3)
-- Writes to games/game_actions are meant to go through Edge Functions
-- (M8, service role — bypasses RLS) running the shared engine, not
-- directly from the client. RLS below reflects that: clients can read
-- what they're entitled to see, but can't write game state directly.

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles are readable by any authenticated user"
  on profiles for select
  to authenticated
  using (true);

create policy "users can insert their own profile"
  on profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "users can update their own profile"
  on profiles for update
  to authenticated
  using (auth.uid() = id);

-- ---------------------------------------------------------------------

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  host_id uuid not null references profiles (id) on delete cascade,
  mode text not null default 'classic',
  max_players smallint not null default 5,
  status text not null default 'lobby', -- lobby | in_progress | finished
  created_at timestamptz not null default now()
);

alter table rooms enable row level security;

create policy "rooms are readable by any authenticated user"
  on rooms for select
  to authenticated
  using (true);

create policy "hosts can create rooms"
  on rooms for insert
  to authenticated
  with check (auth.uid() = host_id);

create policy "hosts can update their own room"
  on rooms for update
  to authenticated
  using (auth.uid() = host_id);

-- ---------------------------------------------------------------------

create table if not exists room_players (
  room_id uuid not null references rooms (id) on delete cascade,
  user_id uuid references profiles (id) on delete cascade,
  seat_index smallint not null,
  is_ai boolean not null default false,
  ai_personality text, -- 'miser' | 'gambler' | 'troll', null if not AI
  connected_at timestamptz,
  primary key (room_id, seat_index)
);

alter table room_players enable row level security;

create policy "room_players are readable by any authenticated user"
  on room_players for select
  to authenticated
  using (true);

create policy "players can seat themselves"
  on room_players for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "players can update their own seat"
  on room_players for update
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------

create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms (id) on delete cascade,
  seed text not null,
  status text not null default 'active', -- active | finished | abandoned
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

alter table games enable row level security;

create policy "games are readable by room members"
  on games for select
  to authenticated
  using (
    exists (
      select 1 from room_players
      where room_players.room_id = games.room_id
        and room_players.user_id = auth.uid()
    )
  );

-- No insert/update policy for authenticated clients — games are created
-- and progressed only by the validate-action Edge Function (M8), which
-- uses the service role key and bypasses RLS entirely.

-- ---------------------------------------------------------------------

create table if not exists game_actions (
  id bigint generated always as identity primary key,
  game_id uuid not null references games (id) on delete cascade,
  seq integer not null,
  actor_id uuid references profiles (id),
  action_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (game_id, seq)
);

alter table game_actions enable row level security;

create policy "game_actions are readable by room members"
  on game_actions for select
  to authenticated
  using (
    exists (
      select 1 from games
      join room_players on room_players.room_id = games.room_id
      where games.id = game_actions.game_id
        and room_players.user_id = auth.uid()
    )
  );

-- Same as `games`: writes only via the Edge Function's service role.

-- ---------------------------------------------------------------------

create table if not exists reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references profiles (id),
  room_id uuid references rooms (id),
  reported_user_id uuid references profiles (id),
  reason text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

alter table reports enable row level security;

create policy "players can file a report"
  on reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);

-- Deliberately no select policy for regular users — per the M1 admin-
-- tooling decision, reports are reviewed via the Supabase dashboard
-- (service role) for V1, not a client-facing view.
