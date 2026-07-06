// Deno Edge Function. Cannot be executed or typechecked in this
// environment (no Deno runtime available here — see the M8 summary).
// Kept deliberately thin: the only real logic it owns is room-code
// generation and the initial DB writes; game rules live entirely in
// ../_shared/gameLogic.ts, which IS tested.
//
// deno-lint-ignore-file
import { createClient } from "npm:@supabase/supabase-js@2";
import { withCors } from "../_shared/cors.ts";
import { ensureProfile } from "../_shared/profile.ts";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function generateRoomCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // service role — this function IS the trust boundary
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
    }

    // rooms.host_id / room_players.user_id FK to profiles(id) — guarantee the row
    // exists before we insert, so a fast create never races the client.
    const profile = await ensureProfile(supabase, user);
    if (profile.error) {
      return new Response(JSON.stringify({ error: profile.error }), { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const maxPlayers = Math.min(Math.max(Number(body.maxPlayers) || 5, 2), 5);
    const ALLOWED_MODES = ["classic", "quick", "marathon"];
    const mode = ALLOWED_MODES.includes(String(body.mode)) ? String(body.mode) : "classic";
    // House rules are validated server-side on every move via the shared engine,
    // so storing the client-provided object is safe: a malformed one just yields
    // a state that rejects illegal actions. Null = engine defaults.
    const houseRules =
      body.houseRules && typeof body.houseRules === "object" ? body.houseRules : null;

    const roomCode = generateRoomCode();
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .insert({
        room_code: roomCode,
        host_id: user.id,
        mode,
        house_rules: houseRules,
        max_players: maxPlayers,
        status: "lobby",
      })
      .select()
      .single();

    if (roomError || !room) {
      return new Response(
        JSON.stringify({ error: roomError?.message ?? "Failed to create room" }),
        {
          status: 500,
        },
      );
    }

    const { error: seatError } = await supabase.from("room_players").insert({
      room_id: room.id,
      user_id: user.id,
      seat_index: 0,
      is_ai: false,
      connected_at: new Date().toISOString(),
    });

    if (seatError) {
      return new Response(JSON.stringify({ error: seatError.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ roomId: room.id, roomCode: room.room_code }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
);
