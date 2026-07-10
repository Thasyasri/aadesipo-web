import { describe, expect, it, beforeEach } from "vitest";
import { applyAction, createInitialState, CLASSIC_MODE, type GameState } from "@aadesipo/engine";
import {
  db,
  persistNewGame,
  persistAction,
  loadGame,
  listGameResults,
  listResumableGames,
  purgeFinishedGames,
  saveGameResultLocal,
  deleteGame,
} from "./db";
import type { PlayerSetup } from "@/state/gameStore";

const PLAYERS: PlayerSetup[] = [
  { id: "p1", displayName: "Alice" },
  { id: "p2", displayName: "Bob" },
];

beforeEach(async () => {
  await db.gameMeta.clear();
  await db.gameActions.clear();
  await db.gameSnapshots.clear();
  await db.gameResults.clear();
});

describe("persistence: save, append, resume", () => {
  it("resuming a fresh game with zero actions reconstructs the initial state", async () => {
    const gameId = "game-1";
    const seed = "seed-1";
    await persistNewGame(gameId, seed, PLAYERS, false);

    const loaded = await loadGame(gameId);
    expect(loaded).not.toBeNull();
    expect(loaded!.actionsToReplay).toHaveLength(0);
    expect(loaded!.snapshot).toBeNull();
    expect(loaded!.meta.players).toEqual(PLAYERS);
  });

  it("replaying persisted actions reconstructs the exact same state as live play", async () => {
    const gameId = "game-2";
    const seed = "seed-2";
    await persistNewGame(gameId, seed, PLAYERS, false);

    let liveState: GameState = createInitialState(
      seed,
      CLASSIC_MODE,
      PLAYERS.map((p) => p.id),
    );
    const actions = [{ type: "RollDice" as const, playerId: "p1" }];
    let seq = 0;
    for (const action of actions) {
      const result = applyAction(liveState, action);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      liveState = result.state;
      seq += 1;
      await persistAction(gameId, seq, action, liveState);
    }

    const loaded = await loadGame(gameId);
    expect(loaded).not.toBeNull();

    let replayedState: GameState = createInitialState(
      loaded!.meta.seed,
      CLASSIC_MODE,
      loaded!.meta.players.map((p) => p.id),
    );
    for (const action of loaded!.actionsToReplay) {
      const result = applyAction(replayedState, action);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      replayedState = result.state;
    }

    expect(replayedState).toEqual(liveState);
  });

  it("uses the nearest snapshot instead of replaying from action 1, once past the snapshot boundary", async () => {
    const gameId = "game-3";
    const seed = "seed-3";
    await persistNewGame(gameId, seed, PLAYERS, false);

    let state: GameState = createInitialState(
      seed,
      CLASSIC_MODE,
      PLAYERS.map((p) => p.id),
    );

    let seq = 0;
    for (let i = 0; i < 40 && state.turnPhase !== "game-over"; i++) {
      const actorId = state.players[state.currentPlayerIndex]!.id;
      let action: Parameters<typeof applyAction>[1];
      if (state.turnPhase === "awaiting-roll") {
        action = { type: "RollDice", playerId: actorId };
      } else if (state.turnPhase === "awaiting-tile-decision") {
        const player = state.players.find((p) => p.id === actorId)!;
        action = { type: "DeclineProperty", playerId: actorId, position: player.position };
      } else if (state.turnPhase === "turn-idle") {
        action = { type: "EndTurn", playerId: actorId };
      } else if (state.turnPhase === "awaiting-auction") {
        action = { type: "PassAuction", playerId: state.pendingAuction!.turnBidderId };
      } else {
        break;
      }
      const result = applyAction(state, action);
      if (!result.ok) break;
      state = result.state;
      seq += 1;
      await persistAction(gameId, seq, action, state);
    }

    expect(seq).toBeGreaterThanOrEqual(20);

    const loaded = await loadGame(gameId);
    expect(loaded!.snapshot).not.toBeNull();
    expect(loaded!.snapshot!.seq).toBeGreaterThan(0);
    expect(loaded!.actionsToReplay.length).toBeLessThan(seq);
    expect(loaded!.actionsToReplay.length).toBe(seq - loaded!.snapshot!.seq);

    let replayedState = loaded!.snapshot!.state;
    for (const action of loaded!.actionsToReplay) {
      const result = applyAction(replayedState, action);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      replayedState = result.state;
    }
    expect(replayedState).toEqual(state);
  });
});

describe("listResumableGames / deleteGame", () => {
  it("only lists unfinished games, and deleteGame removes everything for that gameId", async () => {
    await persistNewGame("unfinished", "s1", PLAYERS, false);
    await persistNewGame("finished", "s2", PLAYERS, false);

    const finishedState = {
      ...createInitialState("s2", CLASSIC_MODE, ["p1", "p2"]),
      turnPhase: "game-over" as const,
    };
    await persistAction("finished", 1, { type: "RollDice", playerId: "p1" }, finishedState);

    const resumable = await listResumableGames();
    const ids = resumable.map((g) => g.gameId);
    expect(ids).toContain("unfinished");
    expect(ids).not.toContain("finished");

    await deleteGame("unfinished");
    const afterDelete = await loadGame("unfinished");
    expect(afterDelete).toBeNull();

    const remainingActions = await db.gameActions.where("gameId").equals("unfinished").toArray();
    expect(remainingActions).toHaveLength(0);
  });
});

describe("purgeFinishedGames", () => {
  /** A finished game with one action and one snapshot behind it. */
  async function finishedGame(gameId: string, updatedAt: number) {
    await persistNewGame(gameId, `seed-${gameId}`, PLAYERS, false);
    const state = createInitialState(`seed-${gameId}`, CLASSIC_MODE, ["p1", "p2"]);
    const rolled = applyAction(state, { type: "RollDice", playerId: "p1" });
    if (!rolled.ok) throw new Error("setup roll rejected");
    await persistAction(gameId, 1, { type: "RollDice", playerId: "p1" }, rolled.state);
    await db.gameMeta.update(gameId, { isFinished: true, updatedAt });
  }

  it("drops the replay data of finished games beyond the retention window", async () => {
    await finishedGame("old", 1_000);
    await finishedGame("new", 2_000);

    const purged = await purgeFinishedGames(1); // keep only the newest finished game

    expect(purged).toBe(1);
    expect(await loadGame("old")).toBeNull();
    expect(await db.gameActions.where("gameId").equals("old").count()).toBe(0);
    expect(await db.gameSnapshots.where("gameId").equals("old").count()).toBe(0);
    // The newest finished game is still whole.
    expect(await loadGame("new")).not.toBeNull();
  });

  it("never touches an unfinished game, however old", async () => {
    await persistNewGame("in-progress", "seed-x", PLAYERS, false);
    await db.gameMeta.update("in-progress", { updatedAt: 1 }); // ancient, but live
    await finishedGame("done", 9_999);

    expect(await purgeFinishedGames(0)).toBe(1); // only "done" qualifies

    expect(await loadGame("in-progress")).not.toBeNull();
    expect(await listResumableGames()).toHaveLength(1);
  });

  it("leaves recorded results alone — stats must survive the purge", async () => {
    await finishedGame("done", 1);
    await saveGameResultLocal({
      id: "done",
      finishedAt: 1,
      mode: "classic",
      source: "vs-ai",
      playerCount: 2,
      won: true,
      reason: "last-player-standing",
      netWorth: 1234,
      rank: 1,
      rounds: 7,
      cities: ["Charminar"],
      synced: false,
    });

    await purgeFinishedGames(0);

    expect(await loadGame("done")).toBeNull(); // replay data gone
    expect(await listGameResults()).toHaveLength(1); // the result remains
  });

  it("is a no-op when nothing has finished", async () => {
    await persistNewGame("live", "seed-y", PLAYERS, false);
    expect(await purgeFinishedGames(0)).toBe(0);
  });
});
