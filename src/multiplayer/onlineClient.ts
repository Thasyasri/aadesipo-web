import type { Action, HouseRules } from "@aadesipo/engine";
import { supabase } from "@/services/supabase";

export interface CreateRoomResult {
  roomId: string;
  roomCode: string;
}

export interface StartGameResult {
  gameId: string;
  seed: string;
}

export interface ValidateActionResponse {
  ok: boolean;
  seq?: number;
  reason?: string;
  error?: string;
}

function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured — see README for setup.");
  return supabase;
}

export async function createRoom(
  maxPlayers: number,
  mode: string,
  houseRules: HouseRules,
): Promise<CreateRoomResult> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke<CreateRoomResult>("create-room", {
    body: { maxPlayers, mode, houseRules },
  });
  if (error || !data) throw new Error(error?.message ?? "Failed to create room");
  return data;
}

export async function joinRoom(roomCode: string): Promise<{ roomId: string }> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke<{ roomId: string }>("join-room", {
    body: { roomCode },
  });
  if (error || !data) throw new Error(error?.message ?? "Failed to join room");
  return data;
}

export async function startGame(roomId: string): Promise<StartGameResult> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke<StartGameResult>("start-game", {
    body: { roomId },
  });
  if (error || !data) throw new Error(error?.message ?? "Failed to start game");
  return data;
}

export async function submitAction(
  gameId: string,
  action: Action,
): Promise<ValidateActionResponse> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke<ValidateActionResponse>("validate-action", {
    body: { gameId, action },
  });
  if (error) return { ok: false, error: error.message };
  return data ?? { ok: false, error: "Empty response from server" };
}

export interface RemoteAction {
  seq: number;
  action: Action;
}

/**
 * Subscribes to new game_actions rows via Supabase's postgres_changes
 * realtime — the entire sync mechanism, no manual broadcast() needed
 * since validate-action's INSERT triggers it automatically for every
 * subscribed client, including the one who submitted it (an "echo" the
 * caller dedupes against — see the game store).
 */
export function subscribeToGameActions(
  gameId: string,
  onAction: (remote: RemoteAction) => void,
): () => void {
  const client = requireSupabase();
  const channel = client
    .channel(`game-actions-${gameId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "game_actions",
        filter: `game_id=eq.${gameId}`,
      },
      (payload) => {
        const row = payload.new as { seq: number; payload: Action };
        onAction({ seq: row.seq, action: row.payload });
      },
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

export async function fetchAllActions(gameId: string): Promise<RemoteAction[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("game_actions")
    .select("seq, payload")
    .eq("game_id", gameId)
    .order("seq", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ seq: row.seq, action: row.payload as Action }));
}

export async function fetchRoomSeats(
  roomId: string,
): Promise<Array<{ userId: string; seatIndex: number }>> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("room_players")
    .select("user_id, seat_index")
    .eq("room_id", roomId)
    .order("seat_index", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ userId: row.user_id, seatIndex: row.seat_index }));
}

export async function fetchProfiles(
  userIds: readonly string[],
): Promise<Record<string, { displayName: string | null }>> {
  if (userIds.length === 0) return {};
  const client = requireSupabase();
  const { data, error } = await client
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);
  if (error) throw new Error(error.message);
  const map: Record<string, { displayName: string | null }> = {};
  for (const row of data ?? []) {
    map[row.id] = { displayName: row.display_name };
  }
  return map;
}

export async function fetchActiveGameForRoom(
  roomId: string,
): Promise<{ gameId: string; seed: string } | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("games")
    .select("id, seed")
    .eq("room_id", roomId)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { gameId: data.id, seed: data.seed };
}

export interface RoomInfo {
  id: string;
  roomCode: string;
  hostId: string;
  maxPlayers: number;
  status: "lobby" | "in_progress" | "finished";
  /** Stored game mode id and house rules — used to rebuild game state
   *  identically to how the server validates it. */
  mode: string;
  houseRules: HouseRules | null;
}

export async function fetchRoomInfo(roomId: string): Promise<RoomInfo> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("rooms")
    .select("id, room_code, host_id, max_players, status, mode, house_rules")
    .eq("id", roomId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Room not found");
  return {
    id: data.id,
    roomCode: data.room_code,
    hostId: data.host_id,
    maxPlayers: data.max_players,
    status: data.status,
    mode: data.mode ?? "classic",
    houseRules: (data.house_rules as HouseRules | null) ?? null,
  };
}

/** Live seat updates for the lobby screen — separate from game_actions
 *  realtime since this watches a different table (room_players). */
export function subscribeToRoomPlayers(roomId: string, onChange: () => void): () => void {
  const client = requireSupabase();
  const channel = client
    .channel(`room-players-${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
      () => onChange(),
    )
    .subscribe((status) => {
      // Reconcile anything that changed during the subscribe handshake (e.g. a
      // player who joined in that window) — realtime only delivers events that
      // occur after the channel is live, so without this a missed join would
      // leave the lobby stuck.
      if (status === "SUBSCRIBED") onChange();
    });

  return () => {
    void client.removeChannel(channel);
  };
}
