// Deno Edge Function — see create-room/index.ts for the same caveats.
//
// The trust boundary for the public leaderboard. Before this existed, a client
// POSTed its own `{won: true, net_worth: <anything>}` row straight into
// game_results, and RLS only checked that the row belonged to the caller — it
// never verified the game existed, that the caller was seated in it, or that
// they had won. Anyone authenticated could have topped the board.
//
// Now the server replays the game's own action log and derives the result
// itself. The client supplies exactly one thing: which game it wants recorded.
//
// deno-lint-ignore-file
import { createClient } from "npm:@supabase/supabase-js@2";
import { modeById, type Action, type HouseRules } from "../../../packages/engine/dist/index.js";
import { deriveGameResult, replayToCurrentState } from "../_shared/gameLogic.ts";
import { withCors } from "../_shared/cors.ts";

Deno.serve(
  withCors(async (req: Request) => {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
      });
    }

    // Service-role client: game_results has no INSERT policy for `online` rows,
    // by design — this function is the only writer. The caller is still
    // authenticated explicitly via getUser(token) below.
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
    if (user.is_anonymous) {
      return new Response(JSON.stringify({ error: "Guests keep results on-device" }), {
        status: 403,
      });
    }

    const body = await req.json().catch(() => ({}));
    const gameId = String(body.gameId ?? "");
    if (!gameId) {
      return new Response(JSON.stringify({ error: "gameId is required" }), { status: 400 });
    }

    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("id, room_id, seed, status, ended_at")
      .eq("id", gameId)
      .single();
    if (gameError || !game) {
      return new Response(JSON.stringify({ error: "Game not found" }), { status: 404 });
    }
    // validate-action marks a game finished the moment its own replay reaches
    // game-over, so this is the server's word, not the client's.
    if (game.status !== "finished") {
      return new Response(JSON.stringify({ error: "This game has not finished" }), { status: 409 });
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
    if (!playerIds.includes(user.id)) {
      return new Response(JSON.stringify({ error: "You did not play in this game" }), {
        status: 403,
      });
    }

    const { data: actions, error: actionsError } = await supabase
      .from("game_actions")
      .select("payload")
      .eq("game_id", gameId)
      .order("seq", { ascending: true });
    if (actionsError) {
      return new Response(JSON.stringify({ error: actionsError.message }), { status: 500 });
    }

    let finalState;
    try {
      finalState = replayToCurrentState(
        game.seed,
        modeById(room.mode),
        playerIds,
        (actions ?? []).map((a) => a.payload as Action),
        (room.house_rules as HouseRules | null) ?? undefined,
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: `Stored action log is corrupt: ${(err as Error).message}` }),
        { status: 500 },
      );
    }

    const derived = deriveGameResult(finalState, user.id);
    if (!derived) {
      return new Response(JSON.stringify({ error: "Game did not reach a result" }), {
        status: 409,
      });
    }

    // Idempotent: each player writes one row per game, deduped on
    // (user_id, game_id). A retried sync is a no-op rather than a duplicate.
    const { error: insertError } = await supabase.from("game_results").upsert(
      {
        game_id: gameId,
        user_id: user.id,
        source: "online",
        mode: derived.mode,
        player_count: derived.playerCount,
        won: derived.won,
        reason: derived.reason,
        net_worth: derived.netWorth,
        rank: derived.rank,
        rounds: derived.rounds,
        cities: derived.cities,
        finished_at: game.ended_at ?? new Date().toISOString(),
      },
      { onConflict: "user_id,game_id", ignoreDuplicates: true },
    );
    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
);
