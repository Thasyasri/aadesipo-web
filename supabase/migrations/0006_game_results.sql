-- Phase 2b — per-player finished-game results for personal stats and (later)
-- online leaderboards.
--
-- Unlike games/game_actions (written only by the service-role Edge Functions),
-- a player writes their OWN result row directly here, RLS-guarded to their
-- user_id. Local (source = 'vs-ai') rows are self-reported and feed private
-- stats only; only source = 'online' rows — which already passed server-side
-- engine validation as the game was played — will be eligible for public
-- leaderboards (a later view filters on that; see D4).
--
-- One row per (user, game): each player in an online game inserts their own
-- row for the same game_id, so the natural key is (user_id, game_id), not
-- game_id alone.

create table if not exists game_results (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null,
  user_id uuid not null references profiles (id) on delete cascade,
  mode text not null, -- classic | quick | marathon
  source text not null, -- vs-ai | online
  player_count smallint not null,
  won boolean not null,
  reason text not null, -- last-player-standing | net-worth-at-cap
  net_worth integer not null, -- engine units (x1000 = rupees)
  rank smallint not null,
  rounds integer not null,
  cities text[] not null default '{}',
  finished_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, game_id)
);

create index if not exists game_results_user_idx on game_results (user_id, finished_at desc);
create index if not exists game_results_online_idx on game_results (source) where source = 'online';

alter table game_results enable row level security;

create policy "users read their own results"
  on game_results for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users insert their own results"
  on game_results for insert
  to authenticated
  with check (auth.uid() = user_id);
