import { netWorth, getTile, type GameState, type PropertyTile } from "@aadesipo/engine";
import { saveGameResultLocal, listUnsyncedResults, markResultsSynced, type GameResult } from "./db";
import { supabase } from "./supabase";

type Mode = GameResult["mode"];
const MODES: readonly Mode[] = ["classic", "quick", "marathon"];

/**
 * Record a finished game for personal stats. Called once at game-over from the
 * victory screen. Local-first (guests included, works offline); a signed-in
 * player's results also sync to Supabase. Idempotent per game id.
 */
export async function recordGameResult(input: {
  gameId: string;
  game: GameState;
  source: GameResult["source"];
  localPlayerId: string;
}): Promise<void> {
  const { gameId, game, source, localPlayerId } = input;
  if (game.turnPhase !== "game-over" || !game.winnerId) return;

  const ranked = [...game.players].sort((a, b) => netWorth(game, b.id) - netWorth(game, a.id));
  const rank = ranked.findIndex((p) => p.id === localPlayerId) + 1;
  const reason =
    game.players.filter((p) => !p.isBankrupt).length === 1
      ? "last-player-standing"
      : "net-worth-at-cap";

  // The real cities you held at the final whistle (property tiles only — not
  // transit/utility), for the "favourite cities" stat.
  const cities = Object.entries(game.properties)
    .filter(([, o]) => o.ownerId === localPlayerId)
    .map(([pos]) => getTile(Number(pos)))
    .filter((t): t is PropertyTile => t.type === "property")
    .map((t) => t.name);

  const result: GameResult = {
    id: gameId,
    finishedAt: Date.now(),
    mode: game.mode.id,
    source,
    playerCount: game.players.length,
    won: game.winnerId === localPlayerId,
    reason,
    netWorth: netWorth(game, localPlayerId),
    rank: rank > 0 ? rank : game.players.length,
    rounds: game.roundNumber,
    cities,
    synced: false,
  };

  const isNew = await saveGameResultLocal(result);
  if (isNew) void syncUnsyncedResults();
}

/**
 * Push any not-yet-synced results to Supabase for a signed-in (non-anonymous)
 * player. Guests keep results local-only until they create an account, at which
 * point their backlog syncs on the next trigger. Best-effort: failures leave the
 * rows unsynced to retry later.
 *
 * The two sources take different paths on purpose. A `vs-ai` result is only ever
 * private stats, so the client's own numbers are fine. An `online` result feeds
 * the PUBLIC leaderboard, so the client doesn't get to report it: it names the
 * game, and the record-result Edge Function replays that game's action log and
 * derives won/rank/net-worth itself. RLS refuses client-written online rows.
 */
export async function syncUnsyncedResults(): Promise<void> {
  if (!supabase) return;
  const client = supabase;
  const {
    data: { session },
  } = await client.auth.getSession();
  const user = session?.user;
  if (!user || user.is_anonymous) return; // local-only for guests

  const pending = await listUnsyncedResults();
  if (pending.length === 0) return;

  const synced: string[] = [];

  const local = pending.filter((r) => r.source !== "online");
  if (local.length > 0) {
    const rows = local.map((r) => ({
      // r.id is the engine game id; the server row gets its own generated id and
      // is deduped on (user_id, game_id) so each player's row for a shared online
      // game is distinct.
      game_id: r.id,
      user_id: user.id,
      mode: r.mode,
      source: r.source,
      player_count: r.playerCount,
      won: r.won,
      reason: r.reason,
      net_worth: r.netWorth,
      rank: r.rank,
      rounds: r.rounds,
      cities: r.cities,
      finished_at: new Date(r.finishedAt).toISOString(),
    }));
    const { error } = await client
      .from("game_results")
      .upsert(rows, { onConflict: "user_id,game_id", ignoreDuplicates: true });
    if (!error) synced.push(...local.map((r) => r.id));
  }

  // One call per online game. There's a real race on the winning move: every
  // client reaches game-over from its own replay before validate-action has
  // finished marking the game `finished` server-side, and record-result answers
  // 409 until it has. Retry briefly rather than leaving the row to wait for the
  // next sync trigger — otherwise your win only reaches the board next time you
  // play. If the retries run out the row stays unsynced, so nothing is lost.
  for (const result of pending.filter((r) => r.source === "online")) {
    if (await recordOnlineResult(client, result.id)) synced.push(result.id);
  }

  if (synced.length > 0) await markResultsSynced(synced);
}

const RECORD_RETRY_DELAYS_MS = [0, 1500, 4000];

async function recordOnlineResult(
  client: NonNullable<typeof supabase>,
  gameId: string,
): Promise<boolean> {
  for (const delay of RECORD_RETRY_DELAYS_MS) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    const { error } = await client.functions.invoke("record-result", { body: { gameId } });
    if (!error) return true;
  }
  return false;
}

/* ---- aggregation --------------------------------------------------------- */

export interface PlayerStats {
  games: number;
  wins: number;
  winRate: number; // 0..1
  byMode: Record<Mode, { games: number; wins: number }>;
  bestNetWorth: number; // engine units; ×1000 = rupees
  currentStreak: number;
  bestStreak: number;
  favouriteCities: { name: string; count: number }[];
  online: { games: number; wins: number };
  recent: GameResult[]; // newest first, for the trend row + recent list
}

/** Aggregate results (expected newest-first, as listGameResults returns). */
export function computeStats(results: readonly GameResult[]): PlayerStats {
  const games = results.length;
  const wins = results.filter((r) => r.won).length;

  const byMode = Object.fromEntries(MODES.map((m) => [m, { games: 0, wins: 0 }])) as Record<
    Mode,
    { games: number; wins: number }
  >;
  for (const r of results) {
    const bucket = byMode[r.mode];
    if (bucket) {
      bucket.games++;
      if (r.won) bucket.wins++;
    }
  }

  const bestNetWorth = results.reduce((max, r) => Math.max(max, r.netWorth), 0);

  // Current streak: consecutive wins from the most recent game.
  let currentStreak = 0;
  for (const r of results) {
    if (r.won) currentStreak++;
    else break;
  }

  // Best streak: longest win run over the whole (chronological) history.
  let bestStreak = 0;
  let run = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i]!.won) {
      run++;
      bestStreak = Math.max(bestStreak, run);
    } else {
      run = 0;
    }
  }

  const cityCounts = new Map<string, number>();
  for (const r of results) {
    for (const name of r.cities) cityCounts.set(name, (cityCounts.get(name) ?? 0) + 1);
  }
  const favouriteCities = [...cityCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const onlineResults = results.filter((r) => r.source === "online");

  return {
    games,
    wins,
    winRate: games > 0 ? wins / games : 0,
    byMode,
    bestNetWorth,
    currentStreak,
    bestStreak,
    favouriteCities,
    online: { games: onlineResults.length, wins: onlineResults.filter((r) => r.won).length },
    recent: results.slice(0, 20),
  };
}
