// Deno Edge Function — see create-room/index.ts for the same caveats.
//
// Unsticks a game whose acting player has disconnected. Nobody else can act
// while it's their turn (the engine rejects it, and validate-action rejects any
// action whose actor isn't the caller), so without this a single closed tab
// deadlocks the room permanently.
//
// This is the ONLY place an action is ever written on another player's behalf,
// which is exactly why it runs as service_role and checks staleness itself
// rather than trusting the caller's word for it.
//
// deno-lint-ignore-file
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  getActingPlayerId,
  modeById,
  type Action,
  type HouseRules,
} from "../../../packages/engine/dist/index.js";
import { planTakeoverActions, replayToCurrentState } from "../_shared/gameLogic.ts";
import { withCors } from "../_shared/cors.ts";

/** How long the acting player must be unseen before anyone may play for them.
 *  Long enough to survive a reload, a tunnel, or a slow phone waking up. */
const STALL_THRESHOLD_MS = 60_000;

Deno.serve(
  withCors(async (req: Request) => {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const gameId = String(body.gameId ?? "");
    if (!gameId) {
      return new Response(JSON.stringify({ error: "gameId is required" }), { status: 400 });
    }

    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("id, room_id, seed, status")
      .eq("id", gameId)
      .single();
    if (gameError || !game) {
      return new Response(JSON.stringify({ error: "Game not found" }), { status: 404 });
    }
    if (game.status !== "active") {
      return new Response(JSON.stringify({ error: "This game has already ended" }), {
        status: 409,
      });
    }

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("mode, house_rules")
      .eq("id", game.room_id)
      .single();
    if (roomError || !room) {
      return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });
    }

    const { data: seats, error: seatsError } = await supabase
      .from("room_players")
      .select("user_id")
      .eq("room_id", game.room_id)
      .order("seat_index", { ascending: true });
    if (seatsError || !seats) {
      return new Response(JSON.stringify({ error: "Could not load seats" }), { status: 500 });
    }
    const playerIds = seats.map((s) => s.user_id as string);

    // Only someone with a stake in this game may ask for it to be unstuck.
    if (!playerIds.includes(user.id)) {
      return new Response(JSON.stringify({ error: "You are not in this game" }), { status: 403 });
    }

    const { data: pastActions, error: actionsError } = await supabase
      .from("game_actions")
      .select("payload")
      .eq("game_id", gameId)
      .order("seq", { ascending: true });
    if (actionsError) {
      return new Response(JSON.stringify({ error: actionsError.message }), { status: 500 });
    }

    let state;
    try {
      state = replayToCurrentState(
        game.seed,
        modeById(room.mode),
        playerIds,
        (pastActions ?? []).map((a) => a.payload as Action),
        (room.house_rules as HouseRules | null) ?? undefined,
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: `Stored action log is corrupt: ${(err as Error).message}` }),
        { status: 500 },
      );
    }

    const stalledId = getActingPlayerId(state);
    if (stalledId === user.id) {
      return new Response(JSON.stringify({ error: "It's your own turn" }), { status: 400 });
    }

    // The whole authorisation for acting as someone else: they really are gone.
    const { data: presence } = await supabase
      .from("room_presence")
      .select("last_seen_at")
      .eq("room_id", game.room_id)
      .eq("user_id", stalledId)
      .maybeSingle();

    // No presence row at all means they never heartbeat — treat as absent, since
    // a connected client writes one on join. A fresh row means they're here.
    const lastSeen = presence?.last_seen_at ? Date.parse(presence.last_seen_at) : 0;
    const idleMs = Date.now() - lastSeen;
    if (idleMs < STALL_THRESHOLD_MS) {
      return new Response(JSON.stringify({ error: "That player is still connected", idleMs }), {
        status: 409,
      });
    }

    const seq = pastActions?.length ?? 0;
    const { actions, finalState } = planTakeoverActions(
      state,
      stalledId,
      `takeover:${gameId}:${seq}`,
    );
    if (actions.length === 0) {
      return new Response(JSON.stringify({ ok: true, applied: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // One statement, so the whole takeover lands or none of it does. If another
    // caller (or the returning player) got there first, the unique (game_id, seq)
    // constraint rejects the batch and this call is simply a no-op.
    const rows = actions.map((action, i) => ({
      game_id: gameId,
      seq: seq + i + 1,
      actor_id: stalledId,
      action_type: action.type,
      payload: action,
    }));
    const { error: insertError } = await supabase.from("game_actions").insert(rows);
    if (insertError) {
      return new Response(
        JSON.stringify({ error: "The game moved on — try again", detail: insertError.message }),
        { status: 409 },
      );
    }

    // A takeover can finish the game (the absent player bankrupting), and
    // record-result refuses to write a row until the game is marked finished.
    if (finalState.turnPhase === "game-over") {
      await supabase
        .from("games")
        .update({ status: "finished", ended_at: new Date().toISOString() })
        .eq("id", gameId);
    }

    return new Response(JSON.stringify({ ok: true, applied: actions.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
);
