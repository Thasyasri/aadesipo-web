-- AadesiPo M8 schema additions

-- Required for clients to receive realtime postgres_changes events when
-- validate-action inserts a new row — this is the entire sync mechanism,
-- no manual broadcast() calls needed on either side.
alter publication supabase_realtime add table game_actions;

-- Presence tracking, for the disconnect -> AI takeover design. Added
-- now because it's cheap and forward-compatible. Already covered by
-- the existing "players can update their own seat" policy from the
-- initial migration (RLS gates the row, not individual columns), so no
-- new policy is needed here.
alter table room_players add column if not exists last_seen_at timestamptz;
