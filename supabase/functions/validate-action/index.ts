// Deno Edge Function — see create-room/index.ts for the same caveats.
// This one matters most: it's the actual trust boundary for every
// online move. It stays thin on purpose — replayToCurrentState and
// validateAndApplyAction (../_shared/gameLogic.ts) hold all the real
// logic and are the part that's genuinely tested.
//
// deno-lint-ignore-file
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";
import {
  modeById,
  getActingPlayerId,
  type Action,
  type HouseRules,
} from "../../../packages/engine/dist/index.js"; // built engine — see gameLogic.ts
import { replayToCurrentState, validateAndApplyAction } from "../_shared/gameLogic.ts";
import { withCors } from "../_shared/cors.ts";

/**
 * Untested like everything else in this file (see the M9 summary) —
 * additionally dependent on VAPID keys being configured as Edge Function
 * secrets (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT), which
 * don't exist yet either. Wrapped in try/catch at the call site so a
 * failure here never breaks the actual game action.
 */
async function sendTurnPush(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  gameId: string,
): Promise<void> {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@aadesipo.app";
  if (!publicKey || !privateKey) return; // not configured — silently skip

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  const payload = JSON.stringify({
    title: "Your turn!",
    body: "It's your move in AadesiPo.",
    roomId: gameId,
  });

  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
    } catch (err) {
      // A dead subscription (user revoked permission, uninstalled, etc.)
      // shouldn't stop notifying the player's other devices.
      console.error("Push send failed for one subscription:", err);
    }
  }
}

Deno.serve(withCors(async (req: Request) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
      status: 401,
    });
  }

  // Service-role client (no user Authorization header) so the game_actions
  // INSERT runs as service_role and bypasses RLS (no INSERT policy exists for
  // authenticated users). The caller is authenticated via getUser(token), and
  // seat ownership is enforced in validateAndApplyAction.
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
  const action = body.action as Action | undefined;
  if (!gameId || !action) {
    return new Response(JSON.stringify({ error: "gameId and action are required" }), {
      status: 400,
    });
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

  // The room's mode + house rules define how state is reconstructed, so the
  // server validates under the exact same rules the clients play under.
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

  const { data: pastActions, error: actionsError } = await supabase
    .from("game_actions")
    .select("seq, payload")
    .eq("game_id", gameId)
    .order("seq", { ascending: true });

  if (actionsError) {
    return new Response(JSON.stringify({ error: actionsError.message }), { status: 500 });
  }

  let currentState;
  try {
    currentState = replayToCurrentState(
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

  const result = validateAndApplyAction(currentState, action, user.id);
  if (!result.ok) {
    return new Response(JSON.stringify({ ok: false, reason: result.reason }), { status: 200 });
  }

  const nextSeq = (pastActions?.length ?? 0) + 1;
  const { error: insertError } = await supabase.from("game_actions").insert({
    game_id: gameId,
    seq: nextSeq,
    actor_id: user.id,
    action_type: action.type,
    payload: action,
  });

  if (insertError) {
    return new Response(JSON.stringify({ error: insertError.message }), { status: 500 });
  }

  if (result.state!.turnPhase === "game-over") {
    await supabase
      .from("games")
      .update({ status: "finished", ended_at: new Date().toISOString() })
      .eq("id", gameId);
  } else {
    // Best-effort turn notification — never let a push failure affect
    // the actual game action, which has already succeeded by this point.
    try {
      const newActingId = getActingPlayerId(result.state!);
      if (newActingId !== user.id) {
        await sendTurnPush(supabase, newActingId, gameId);
      }
    } catch (pushError) {
      console.error("Turn push notification failed:", pushError);
    }
  }

  // No explicit broadcast call needed — clients subscribed to
  // postgres_changes on game_actions (filtered by game_id) receive
  // this insert automatically.
  return new Response(JSON.stringify({ ok: true, seq: nextSeq }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}));
