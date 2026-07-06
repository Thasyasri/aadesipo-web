// Deno Edge Function — see create-room/index.ts for the same caveats.
//
// deno-lint-ignore-file
import { createClient } from "npm:@supabase/supabase-js@2";
import { withCors } from "../_shared/cors.ts";
import { ensureProfile } from "../_shared/profile.ts";

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
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
    }

    // room_players.user_id FKs to profiles(id) — a fresh guest joining via link
    // often hasn't had their profile row created by the client yet, so ensure it
    // here before seating them (otherwise the insert dies on the foreign key).
    const profile = await ensureProfile(supabase, user);
    if (profile.error) {
      return new Response(JSON.stringify({ error: profile.error }), { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const roomCode = String(body.roomCode ?? "")
      .trim()
      .toUpperCase();
    if (!roomCode) {
      return new Response(JSON.stringify({ error: "roomCode is required" }), { status: 400 });
    }

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id, status, max_players")
      .eq("room_code", roomCode)
      .single();

    if (roomError || !room) {
      return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });
    }
    if (room.status !== "lobby") {
      return new Response(JSON.stringify({ error: "This game has already started" }), {
        status: 409,
      });
    }

    const { data: existingSeats, error: seatsError } = await supabase
      .from("room_players")
      .select("seat_index, user_id")
      .eq("room_id", room.id);

    if (seatsError) {
      return new Response(JSON.stringify({ error: seatsError.message }), { status: 500 });
    }

    if (existingSeats.some((s) => s.user_id === user.id)) {
      return new Response(JSON.stringify({ roomId: room.id }), { status: 200 });
    }
    if (existingSeats.length >= room.max_players) {
      return new Response(JSON.stringify({ error: "Room is full" }), { status: 409 });
    }

    const takenSeats = new Set(existingSeats.map((s) => s.seat_index));
    let nextSeat = 0;
    while (takenSeats.has(nextSeat)) nextSeat++;

    const { error: insertError } = await supabase.from("room_players").insert({
      room_id: room.id,
      user_id: user.id,
      seat_index: nextSeat,
      is_ai: false,
      connected_at: new Date().toISOString(),
    });

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ roomId: room.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
);
