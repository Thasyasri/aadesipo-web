-- Make the public leaderboard trustworthy.
--
-- 0006 let a client insert its own game_results row, RLS-checked only against
-- `auth.uid() = user_id`. Its comment claimed online rows "already passed
-- server-side engine validation as the game was played" — the ACTIONS did, but
-- the RESULT row never did. Nothing verified the game existed, that the caller
-- was seated in it, or that they had won. Any authenticated user could insert
--   {source: 'online', won: true, net_worth: 999999}
-- and sit at the top of the public board (0007_leaderboard.sql aggregates
-- exactly these rows).
--
-- Online rows are now written only by the record-result Edge Function, which
-- replays the game's own action log and derives won/rank/net_worth itself. It
-- runs as service_role and so bypasses RLS entirely; this policy governs the
-- client path, which keeps working for local `vs-ai` rows (private stats only,
-- never aggregated into any public view).

drop policy if exists "users insert their own results" on game_results;

create policy "users insert their own local results"
  on game_results for insert
  to authenticated
  with check (auth.uid() = user_id and source <> 'online');

-- Existing `online` rows predate server verification and are therefore
-- self-reported. If any exist from testing, clear them before the leaderboard
-- is public — each player's client re-syncs its own games through
-- record-result, which rebuilds the row from the action log:
--
--   delete from game_results where source = 'online';
