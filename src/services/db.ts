import Dexie, { type EntityTable } from "dexie";
import type { Action, GameState, HouseRules, ModeConfig } from "@aadesipo/engine";
import type { PlayerSetup } from "@/state/gameStore";

export interface SavedGameMeta {
  gameId: string;
  seed: string;
  players: PlayerSetup[];
  isPassAndPlay: boolean;
  /** Chosen house rules. Optional so games saved before this feature (which
   *  have none) resume cleanly under classic defaults. */
  houseRules?: HouseRules;
  /** Chosen game mode. Optional for the same backward-compat reason (missing =
   *  classic). */
  mode?: ModeConfig;
  createdAt: number;
  updatedAt: number;
  isFinished: boolean;
}

export interface SavedAction {
  id?: number;
  gameId: string;
  seq: number;
  action: Action;
}

export interface SavedSnapshot {
  id?: number;
  gameId: string;
  seq: number;
  state: GameState;
}

const SNAPSHOT_EVERY_N_ACTIONS = 20;

class AadesipoDB extends Dexie {
  gameMeta!: EntityTable<SavedGameMeta, "gameId">;
  gameActions!: EntityTable<SavedAction, "id">;
  gameSnapshots!: EntityTable<SavedSnapshot, "id">;

  constructor() {
    super("aadesipo");
    this.version(1).stores({
      gameMeta: "gameId, updatedAt, isFinished",
      gameActions: "++id, gameId, seq, [gameId+seq]",
      gameSnapshots: "++id, gameId, seq, [gameId+seq]",
    });
  }
}

export const db = new AadesipoDB();

export async function persistNewGame(
  gameId: string,
  seed: string,
  players: readonly PlayerSetup[],
  isPassAndPlay: boolean,
  houseRules?: HouseRules,
  mode?: ModeConfig,
): Promise<void> {
  const now = Date.now();
  await db.gameMeta.put({
    gameId,
    seed,
    players: [...players],
    isPassAndPlay,
    ...(houseRules ? { houseRules } : {}),
    ...(mode ? { mode } : {}),
    createdAt: now,
    updatedAt: now,
    isFinished: false,
  });
}

export async function persistAction(
  gameId: string,
  seq: number,
  action: Action,
  stateAfter: GameState,
): Promise<void> {
  // One transaction per action: the action row, the meta bump, and any
  // snapshot commit together or not at all. Previously these were three
  // separate awaited transactions, so a mid-action refresh could leave
  // meta pointing past an action row that never landed.
  await db.transaction("rw", db.gameActions, db.gameMeta, db.gameSnapshots, async () => {
    await db.gameActions.add({ gameId, seq, action });
    await db.gameMeta.update(gameId, {
      updatedAt: Date.now(),
      isFinished: stateAfter.turnPhase === "game-over",
    });
    if (seq % SNAPSHOT_EVERY_N_ACTIONS === 0) {
      await db.gameSnapshots.add({ gameId, seq, state: stateAfter });
    }
  });
}

/**
 * Serialized persistence queue. Callers (the store's dispatch) fire this
 * without awaiting so the UI never blocks on IndexedDB — but every save
 * is chained strictly after the previous one, so they can never overlap
 * or land out of order. This is what makes fast, unpaced AI turns safe:
 * a burst of dispatches becomes a provably-ordered FIFO of commits rather
 * than a swarm of racing fire-and-forget transactions.
 *
 * A failed save is isolated (it never breaks the chain for later saves),
 * while the returned promise still rejects for the specific caller that
 * wants to observe its own result.
 */
let persistQueue: Promise<unknown> = Promise.resolve();

export function enqueuePersistAction(
  gameId: string,
  seq: number,
  action: Action,
  stateAfter: GameState,
): Promise<void> {
  const run = persistQueue
    .catch(() => undefined) // don't inherit a prior save's failure
    .then(() => persistAction(gameId, seq, action, stateAfter));
  // Keep the tail alive even if this save rejects, so ordering survives.
  persistQueue = run.catch(() => undefined);
  return run;
}

/**
 * Resolves once every queued save has committed. The store fires saves
 * without awaiting, so callers that need a consistent on-disk view — a
 * reload path, or a test asserting durability — await this first.
 */
export function flushPersistence(): Promise<void> {
  return persistQueue.then(() => undefined);
}

/**
 * Gives any queued-but-uncommitted save its best chance to land before the
 * page is torn down by a refresh, tab close, or navigation. We use
 * `pagehide` rather than `beforeunload` because it fires reliably on mobile
 * Safari and when a tab is backgrounded/discarded — the cases where
 * `beforeunload` is silently skipped. There is no way to *block* teardown
 * on an async IndexedDB commit, so this is a best-effort nudge on top of
 * the real guarantee (one small, ordered, in-flight write at a time).
 *
 * `flush` is injectable so the wiring can be tested without a real unload;
 * it defaults to the module's own flushPersistence. Returns an unsubscribe.
 */
export function registerPersistenceFlush(
  flush: () => Promise<void> = flushPersistence,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = (): void => {
    void flush();
  };
  window.addEventListener("pagehide", handler);
  return () => window.removeEventListener("pagehide", handler);
}

export interface LoadedGame {
  meta: SavedGameMeta;
  snapshot: SavedSnapshot | null;
  actionsToReplay: readonly Action[];
  /** Every action from seq 1, used to rebuild the full activity log (the
   *  snapshot fast-path only covers state, not the event history). */
  allActions: readonly Action[];
}

export async function loadGame(gameId: string): Promise<LoadedGame | null> {
  const meta = await db.gameMeta.get(gameId);
  if (!meta) return null;

  const allActions = await db.gameActions.where("gameId").equals(gameId).sortBy("seq");
  const latestSnapshot = await db.gameSnapshots.where("gameId").equals(gameId).last();

  const actionsToReplay = latestSnapshot
    ? allActions.filter((a) => a.seq > latestSnapshot.seq).map((a) => a.action)
    : allActions.map((a) => a.action);

  return {
    meta,
    snapshot: latestSnapshot ?? null,
    actionsToReplay,
    allActions: allActions.map((a) => a.action),
  };
}

export async function listResumableGames(): Promise<SavedGameMeta[]> {
  const all = await db.gameMeta.orderBy("updatedAt").reverse().toArray();
  return all.filter((g) => !g.isFinished);
}

export async function deleteGame(gameId: string): Promise<void> {
  await db.transaction("rw", db.gameMeta, db.gameActions, db.gameSnapshots, async () => {
    await db.gameMeta.delete(gameId);
    await db.gameActions.where("gameId").equals(gameId).delete();
    await db.gameSnapshots.where("gameId").equals(gameId).delete();
  });
}

/**
 * Drops every stored action and snapshot from `fromSeq` onward — the on-disk
 * side of an undo. Marks the game unfinished again (undoing a game-ending move
 * puts it back in progress). Callers should flush the persist queue first so a
 * still-in-flight save of the undone action can't re-land after this.
 */
export async function deleteActionsFrom(gameId: string, fromSeq: number): Promise<void> {
  await db.transaction("rw", db.gameMeta, db.gameActions, db.gameSnapshots, async () => {
    await db.gameActions
      .where("gameId")
      .equals(gameId)
      .and((a) => a.seq >= fromSeq)
      .delete();
    await db.gameSnapshots
      .where("gameId")
      .equals(gameId)
      .and((s) => s.seq >= fromSeq)
      .delete();
    await db.gameMeta.update(gameId, { updatedAt: Date.now(), isFinished: false });
  });
}
