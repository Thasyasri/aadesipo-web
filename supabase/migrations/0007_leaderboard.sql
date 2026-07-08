-- Phase 2c — online-validated leaderboards (see D4).
--
-- Public boards rank ONLY source = 'online' results, which already passed
-- server-side engine validation when the game was played, and ONLY for players
-- who have opted in. Local (vs-ai) games never appear.

-- Opt-in flag (default off — a player is never listed publicly without choosing to).
alter table profiles
  add column if not exists leaderboard_opt_in boolean not null default false;

-- The board must aggregate EVERY opted-in player's online rows, but game_results
-- RLS restricts each user to their own rows. A security-definer function runs as
-- the owner (bypassing that row RLS) and returns only safe aggregate columns —
-- no emails, no per-game rows, and no user ids (each caller only learns which
-- row is theirs, via is_you). auth.uid() still reflects the CALLER inside a
-- definer function, so is_you is correct per request.
create or replace function public.leaderboard(
  p_mode text default null, -- 'classic' | 'quick' | 'marathon' | null (overall)
  p_since timestamptz default null -- window start, or null for all-time
)
returns table (
  display_name text,
  wins bigint,
  games bigint,
  win_rate numeric,
  is_you boolean
)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(p.display_name, 'Player') as display_name,
    count(*) filter (where gr.won) as wins,
    count(*) as games,
    round(count(*) filter (where gr.won)::numeric / count(*), 3) as win_rate,
    bool_or(gr.user_id = auth.uid()) as is_you
  from game_results gr
  join profiles p on p.id = gr.user_id
  where gr.source = 'online'
    and p.leaderboard_opt_in = true
    and (p_mode is null or gr.mode = p_mode)
    and (p_since is null or gr.finished_at >= p_since)
  group by gr.user_id, p.display_name
  having count(*) >= 5 -- min games so a lucky one-off can't top the board (tunable)
  order by wins desc, win_rate desc
  limit 100;
$$;

grant execute on function public.leaderboard(text, timestamptz) to authenticated, anon;
