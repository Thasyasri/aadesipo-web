// Deno Edge Function — see create-room/index.ts for the same caveats.
// This function didn't exist in the original 3-function plan — without
// it there's no `games` row for validate-action to operate against, so
// it's a genuine gap the M8 design review caught, not scope creep.
//
// deno-lint-ignore-file
import { createClient } from "npm:@supabase/supabase-js@2";
import { generateServerSeed } from "../_shared/gameLogic.ts";
import { withCors } from "../_shared/cors.ts";

Deno.serve(
  withCors(async (req: Request) => {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
      });
    }

    // Service-role client (no user Authorization header) so privileged writes —
    // creating the `games` row — run as service_role and bypass RLS, which has no
    // INSERT policy for authenticated users. The caller is still authenticated by
    // validating their JWT explicitly via getUser(token) below.
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
    const roomId = String(body.roomId ?? "");
    if (!roomId) {
      return new Response(JSON.stringify({ error: "roomId is required" }), { status: 400 });
    }

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id, host_id, status")
      .eq("id", roomId)
      .single();

    if (roomError || !room) {
      return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });
    }
    if (room.host_id !== user.id) {
      return new Response(JSON.stringify({ error: "Only the host can start the game" }), {
        status: 403,
      });
    }
    if (room.status !== "lobby") {
      return new Response(JSON.stringify({ error: "Game already started" }), { status: 409 });
    }

    const { data: seats, error: seatsError } = await supabase
      .from("room_players")
      .select("user_id, seat_index")
      .eq("room_id", roomId)
      .order("seat_index", { ascending: true });

    if (seatsError) {
      return new Response(JSON.stringify({ error: seatsError.message }), { status: 500 });
    }
    if (!seats || seats.length < 2) {
      return new Response(JSON.stringify({ error: "Need at least 2 players to start" }), {
        status: 400,
      });
    }

    const seed = generateServerSeed();
    const { data: game, error: gameError } = await supabase
      .from("games")
      .insert({ room_id: roomId, seed, status: "active" })
      .select()
      .single();

    if (gameError || !game) {
      return new Response(JSON.stringify({ error: gameError?.message ?? "Failed to start game" }), {
        status: 500,
      });
    }

    await supabase.from("rooms").update({ status: "in_progress" }).eq("id", roomId);

    return new Response(JSON.stringify({ gameId: game.id, seed }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
);
