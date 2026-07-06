import { describe, expect, it, beforeEach } from "vitest";
import { getActingPlayerId, type Action, type GameState } from "@aadesipo/engine";
import { useGameView, buildAiOpponents, AI_DIFFICULTY_SKILL } from "./gameStore";
import { db, loadGame, flushPersistence } from "@/services/db";

beforeEach(async () => {
  await flushPersistence(); // drain anything a prior test queued
  await db.gameMeta.clear();
  await db.gameActions.clear();
  await db.gameSnapshots.clear();
  useGameView.setState({
    gameId: null,
    game: null,
    players: [],
    actionSeq: 0,
    recentEvents: [],
    eventLog: [],
    lastError: null,
  });
});

/**
 * A legal action for whatever phase the game is in — enough to keep a game
 * advancing indefinitely without buying anything (declining keeps games
 * long, so a single burst produces a big pile of actions to persist).
 */
function chooseLegalAction(game: GameState): Action | null {
  const actorId = getActingPlayerId(game);
  switch (game.turnPhase) {
    case "awaiting-roll":
      return { type: "RollDice", playerId: actorId };
    case "awaiting-tile-decision": {
      const player = game.players.find((p) => p.id === actorId)!;
      return { type: "DeclineProperty", playerId: actorId, position: player.position };
    }
    case "awaiting-auction":
      return { type: "PassAuction", playerId: game.pendingAuction!.turnBidderId };
    case "turn-idle":
      return { type: "EndTurn", playerId: actorId };
    default:
      return null; // game-over
  }
}

/** Fire actions back-to-back with ZERO awaiting between them — the exact
 *  shape of unpaced AI turns. Returns the actions the engine accepted. */
function rapidFireBurst(count: number): Action[] {
  const dispatched: Action[] = [];
  for (let i = 0; i < count; i++) {
    const store = useGameView.getState();
    const game = store.game;
    if (!game || game.turnPhase === "game-over") break;
    const action = chooseLegalAction(game);
    if (!action) break;

    const seqBefore = store.actionSeq;
    store.dispatch(action);
    if (useGameView.getState().actionSeq !== seqBefore + 1) {
      throw new Error(`dispatch rejected a supposedly-legal action at step ${i}`);
    }
    dispatched.push(action);
  }
  return dispatched;
}

describe("gameStore persistence under rapid-fire dispatch (fast AI turns)", () => {
  it("persists every action, in order, with no drops or gaps, and a reload replays them all", async () => {
    const gameId = "rapid-fire";
    const players = buildAiOpponents("You", ["gambler", "troll"]); // Vs. AI, 3 players
    await useGameView.getState().startGame(gameId, players, false, { seed: "rapid-fire-seed" });

    // dispatch() stays synchronous; the saves are queued behind the scenes.
    const dispatched = rapidFireBurst(150);

    // Nothing was awaited during the burst; now wait for the queue to drain.
    await flushPersistence();

    expect(dispatched.length).toBeGreaterThanOrEqual(50); // a genuinely large burst

    // Every action is on disk, contiguous seq 1..N, in the exact order sent.
    const stored = await db.gameActions.where("gameId").equals(gameId).sortBy("seq");
    expect(stored).toHaveLength(dispatched.length);
    stored.forEach((row, i) => {
      expect(row.seq).toBe(i + 1);
      expect(row.action).toEqual(dispatched[i]);
    });

    // loadGame's replay set is complete too (snapshot boundary honored).
    const loaded = await loadGame(gameId);
    expect(loaded).not.toBeNull();
    const highestSeq = loaded!.snapshot ? loaded!.snapshot.seq : 0;
    expect(highestSeq + loaded!.actionsToReplay.length).toBe(dispatched.length);

    // A genuine reload reconstructs the identical live game state.
    const liveGame = useGameView.getState().game;
    const ok = await useGameView.getState().resumeGame(gameId);
    expect(ok).toBe(true);
    expect(useGameView.getState().actionSeq).toBe(dispatched.length);
    expect(useGameView.getState().game).toEqual(liveGame);
  });

  it("accumulates a full activity log that survives a reload from IndexedDB", async () => {
    const gameId = "activity-log";
    const players = buildAiOpponents("You", ["gambler", "troll"]);
    await useGameView.getState().startGame(gameId, players, false, { seed: "activity-log-seed" });
    expect(useGameView.getState().eventLog).toHaveLength(0);

    const dispatched = rapidFireBurst(60);
    await flushPersistence();
    expect(dispatched.length).toBeGreaterThan(20); // ensure we cross a snapshot boundary

    const liveLog = useGameView.getState().eventLog;
    // The log accumulates the whole game, not just the latest action's events.
    expect(liveLog.length).toBeGreaterThan(useGameView.getState().recentEvents.length);
    expect(liveLog.length).toBeGreaterThanOrEqual(dispatched.length);
    // History reaches all the way back to the opening dice roll.
    expect(liveLog[0]?.type).toBe("DiceRolled");

    // Reload from disk — the entire history is reconstructed identically,
    // not just the tail after the most recent snapshot.
    const ok = await useGameView.getState().resumeGame(gameId);
    expect(ok).toBe(true);
    expect(useGameView.getState().eventLog).toEqual(liveLog);
    // And it genuinely spans past a snapshot boundary (proves it isn't just
    // the post-snapshot replay set).
    const loaded = await loadGame(gameId);
    expect(loaded!.snapshot).not.toBeNull();
    expect(loaded!.allActions.length).toBeGreaterThan(loaded!.actionsToReplay.length);
  });

  it("serializes saves — never more than one persist transaction is in flight at once", async () => {
    // This is what actually distinguishes the fix from the old fire-and-forget
    // path. In-process, IndexedDB reads politely queue behind writes, so a
    // dropped save can't be *observed* by a later read — but the danger in
    // real life is a refresh tearing down the page while many writes are
    // still open. The queue collapses that to a single in-flight write at a
    // time. We probe db.transaction to prove the concurrency is exactly 1;
    // the old `void persistAction(...)` path would open dozens at once.
    const gameId = "serialized";
    const players = buildAiOpponents("You", ["gambler", "troll"]);
    await useGameView.getState().startGame(gameId, players, false, { seed: "serialized-seed" });

    const savedTx = db.transaction;
    let inFlight = 0;
    let maxInFlight = 0;
    // Test probe: wrap Dexie's overloaded transaction method to count how
    // many persist transactions are open simultaneously.
    db.transaction = function (...args: unknown[]) {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // @ts-expect-error dynamic passthrough to the real overloaded method
      return savedTx.apply(db, args).finally(() => {
        inFlight -= 1;
      });
    } as typeof db.transaction;

    let dispatched: Action[];
    try {
      dispatched = rapidFireBurst(80);
      await flushPersistence();
    } finally {
      db.transaction = savedTx;
    }

    expect(dispatched.length).toBeGreaterThanOrEqual(50);
    expect(maxInFlight).toBe(1); // strictly serialized, never overlapping

    // ...and the burst still landed completely and in order.
    const stored = await db.gameActions.where("gameId").equals(gameId).sortBy("seq");
    expect(stored.map((r) => r.seq)).toEqual(dispatched.map((_, i) => i + 1));
    expect(stored.map((r) => r.action)).toEqual(dispatched);
  });
});

describe("undo (pass-and-play)", () => {
  const players = [
    { id: "p1", displayName: "P1" },
    { id: "p2", displayName: "P2" },
  ];

  it("reverts the last non-roll action, but refuses to un-roll the dice", async () => {
    const gameId = "undo-pp";
    // seed "undo-0": p1's first roll lands on an unowned property (pos 3).
    await useGameView.getState().startGame(gameId, players, true, { seed: "undo-0" });

    useGameView.getState().dispatch({ type: "RollDice", playerId: "p1" });
    expect(useGameView.getState().game!.turnPhase).toBe("awaiting-tile-decision");
    const pos = useGameView.getState().game!.players.find((p) => p.id === "p1")!.position;

    // A dice roll is not undoable on its own (no re-rolling).
    await useGameView.getState().undo();
    expect(useGameView.getState().actionSeq).toBe(1);
    expect(useGameView.getState().game!.turnPhase).toBe("awaiting-tile-decision");

    // Buy the property, then take it back.
    useGameView.getState().dispatch({ type: "BuyProperty", playerId: "p1", position: pos });
    expect(useGameView.getState().actionSeq).toBe(2);
    expect(useGameView.getState().game!.properties[pos]?.ownerId).toBe("p1");

    await useGameView.getState().undo();
    const st = useGameView.getState();
    expect(st.actionSeq).toBe(1);
    expect(st.lastAction?.type).toBe("RollDice");
    expect(st.game!.turnPhase).toBe("awaiting-tile-decision");
    expect(st.game!.properties[pos]?.ownerId).toBeUndefined();

    // The undone action is gone from disk too, so a resume matches.
    const stored = await db.gameActions.where("gameId").equals(gameId).sortBy("seq");
    expect(stored.map((r) => r.seq)).toEqual([1]);
  });

  it("is a no-op outside pass-and-play", async () => {
    const gameId = "undo-vsai";
    // seed "undo-2": p1's first roll resolves straight to turn-idle.
    await useGameView.getState().startGame(gameId, players, false, { seed: "undo-2" });
    useGameView.getState().dispatch({ type: "RollDice", playerId: "p1" });
    expect(useGameView.getState().game!.turnPhase).toBe("turn-idle");
    useGameView.getState().dispatch({ type: "EndTurn", playerId: "p1" });
    expect(useGameView.getState().actionSeq).toBe(2);

    await useGameView.getState().undo();
    expect(useGameView.getState().actionSeq).toBe(2); // unchanged — undo is offline-local only
  });
});

describe("AI difficulty", () => {
  it("applies the chosen skill level to every AI opponent", () => {
    const hard = buildAiOpponents("You", ["gambler", "troll"], AI_DIFFICULTY_SKILL.hard);
    const hardAis = hard.filter((p) => p.ai);
    expect(hardAis).toHaveLength(2);
    expect(hardAis.every((p) => p.ai!.skillLevel === AI_DIFFICULTY_SKILL.hard)).toBe(true);

    // Easy really is a lower skill than hard (weaker decision quality).
    const easy = buildAiOpponents("You", ["gambler"], AI_DIFFICULTY_SKILL.easy);
    expect(easy.find((p) => p.ai)!.ai!.skillLevel).toBeLessThan(AI_DIFFICULTY_SKILL.hard);
  });
});
