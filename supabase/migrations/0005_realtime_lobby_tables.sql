-- Lobby realtime: clients watch room_players (seat joins) and rooms (status
-- flips to 'in_progress' when the host starts) via postgres_changes. Migration
-- 0002 only published game_actions, so the lobby never received either event —
-- seat counts didn't update and non-hosts never auto-navigated into the game.
-- Both tables are already "readable by any authenticated user" (RLS from 0001),
-- so realtime will deliver their changes to every player in the room.
alter publication supabase_realtime add table room_players;
alter publication supabase_realtime add table rooms;
