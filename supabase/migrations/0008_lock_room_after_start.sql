-- Close two gaps in the room/seat UPDATE policies.
--
-- 1. Neither policy had a `with check`, so `using` only decided WHICH ROW you
--    could update, never what you could turn it into. A seated player could
--    rewrite their own row's `user_id` to someone else's, and validate-action
--    derives the turn order live from room_players — so the roster (and with it
--    whose turn it is) was rewritable by any participant.
--
-- 2. Neither policy was scoped to the lobby. A host could change `mode` or
--    `house_rules` after the game had started; validate-action re-reads those on
--    every call and replays the whole action log under them. Best case that
--    throws "Corrupt action log" and bricks the game permanently; worse case the
--    server silently validates under rules the clients aren't playing.
--
-- Nothing in the app performs either update today (rooms/room_players are only
-- written by the create-room, join-room and start-game Edge Functions, which run
-- as service_role and bypass RLS entirely). These policies exist for lobby-time
-- settings and seat changes, so scope them to exactly that.

drop policy if exists "hosts can update their own room" on rooms;

create policy "hosts can update their own room"
  on rooms for update
  to authenticated
  using (auth.uid() = host_id and status = 'lobby')
  with check (auth.uid() = host_id and status = 'lobby');

drop policy if exists "players can update their own seat" on room_players;

create policy "players can update their own seat"
  on room_players for update
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from rooms r where r.id = room_players.room_id and r.status = 'lobby'
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from rooms r where r.id = room_players.room_id and r.status = 'lobby'
    )
  );
