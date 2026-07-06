import { describe, expect, it, beforeEach } from "vitest";
import { applyAction, createInitialState, CLASSIC_MODE, type GameState } from "@aadesipo/engine";
import { db, persistNewGame, persistAction, loadGame, listResumableGames, deleteGame } from "./db";
import type { PlayerSetup } from "@/state/gameStore";

const PLAYERS: PlayerSetup[] = [
  { id: "p1", displayName: "Alice" },
  { id: "p2", displayName: "Bob" },
];

beforeEach(async () => {
  await db.gameMeta.clear();
  await db.gameActions.clear();
  await db.gameSnapshots.clear();
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
