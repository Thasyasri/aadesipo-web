import { describe, expect, it } from "vitest";
import {
  CLASSIC_MODE,
  getActingPlayerId,
  getTile,
  type Action,
  type GameState,
} from "../../../packages/engine/src/index.ts";
import {
  actorIdForAction,
  deriveGameResult,
  generateServerSeed,
  MAX_TAKEOVER_ACTIONS,
  planTakeoverActions,
  replayToCurrentState,
  validateAndApplyAction,
} from "./gameLogic.ts";

describe("actorIdForAction", () => {
  it("uses proposerId for ProposeTrade and playerId for everything else", () => {
    const propose: Action = {
      type: "ProposeTrade",
      proposerId: "alice",
      recipientId: "bob",
      proposerGives: { cash: 0, propertyPositions: [] },
      recipientGives: { cash: 0, propertyPositions: [] },
    };
    expect(actorIdForAction(propose)).toBe("alice");

    const roll: Action = { type: "RollDice", playerId: "carol" };
    expect(actorIdForAction(roll)).toBe("carol");

    const buy: Action = { type: "BuyProperty", playerId: "dave", position: 1 };
    expect(actorIdForAction(buy)).toBe("dave");
  });
});

describe("replayToCurrentState", () => {
  it("reconstructs the same state as applying actions live, from seed + log alone", () => {
    const seed = "server-seed-1";
    const playerIds = ["alice", "bob"];

    const roll: Action = { type: "RollDice", playerId: "alice" };
    const replayed = replayToCurrentState(seed, CLASSIC_MODE, playerIds, [roll]);

    expect(replayed.players).toHaveLength(2);
    expect(replayed.seed).toBe(seed);
    expect(replayed).not.toEqual(replayToCurrentState(seed, CLASSIC_MODE, playerIds, []));
  });

  it("throws on a corrupt/illegal action log rather than silently returning a wrong state", () => {
    const seed = "server-seed-2";
    const playerIds = ["alice", "bob"];
    const illegal: Action = { type: "RollDice", playerId: "bob" };
    expect(() => replayToCurrentState(seed, CLASSIC_MODE, playerIds, [illegal])).toThrow();
  });
});

describe("validateAndApplyAction — the server-authoritative gate", () => {
  it("rejects an action whose claimed actor doesn't match the authenticated user", () => {
    const state = replayToCurrentState("seed", CLASSIC_MODE, ["alice", "bob"], []);
    const spoofed: Action = { type: "RollDice", playerId: "alice" };
    const result = validateAndApplyAction(state, spoofed, "bob");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/does not own seat/);
  });

  it("accepts and applies a legitimate action from its rightful actor", () => {
    const state = replayToCurrentState("seed", CLASSIC_MODE, ["alice", "bob"], []);
    const legit: Action = { type: "RollDice", playerId: "alice" };
    const result = validateAndApplyAction(state, legit, "alice");
    expect(result.ok).toBe(true);
    expect(result.state).toBeDefined();
    expect(result.events?.some((e) => e.type === "DiceRolled")).toBe(true);
  });

  it("rejects a legitimately-owned but engine-illegal action (not this player's turn)", () => {
    const state = replayToCurrentState(
      "seed",
      CLASSIC_MODE,
      ["alice", "bob"],
      [{ type: "RollDice", playerId: "alice" }],
    );
    const result = validateAndApplyAction(state, { type: "EndTurn", playerId: "bob" }, "bob");
    expect(result.ok).toBe(false);
    expect(result.reason).not.toMatch(/does not own seat/);
  });

  it("propagates a ProposeTrade's proposerId through the seat-ownership check correctly", () => {
    const state = replayToCurrentState("seed", CLASSIC_MODE, ["alice", "bob"], []);
    const trade: Action = {
      type: "ProposeTrade",
      proposerId: "alice",
      recipientId: "bob",
      proposerGives: { cash: 0, propertyPositions: [] },
      recipientGives: { cash: 0, propertyPositions: [] },
    };
    const spoofed = validateAndApplyAction(state, trade, "bob");
    expect(spoofed.ok).toBe(false);
    expect(spoofed.reason).toMatch(/does not own seat/);

    const legit = validateAndApplyAction(state, trade, "alice");
    // The seat-ownership check passed (alice legitimately proposing as
    // herself) — whatever the engine decides about the trade's contents
    // is a separate concern from seat ownership, which is what this
    // test is actually checking.
    expect(legit.reason ?? "").not.toMatch(/does not own seat/);
  });
});

describe("generateServerSeed", () => {
  it("produces a different seed every call", () => {
    const seeds = new Set(Array.from({ length: 20 }, () => generateServerSeed()));
    expect(seeds.size).toBe(20);
  });
});

describe("deriveGameResult", () => {
  const seed = "result-seed";
  const playerIds = ["alice", "bob"] as const;

  /** A finished game: alice holds tile 1 and bob has gone bankrupt. */
  function finishedGame(): GameState {
    const base = replayToCurrentState(seed, CLASSIC_MODE, playerIds, []);
    return {
      ...base,
      turnPhase: "game-over",
      winnerId: "alice",
      roundNumber: 12,
      players: base.players.map((p) => (p.id === "bob" ? { ...p, isBankrupt: true, cash: 0 } : p)),
      properties: { 1: { ownerId: "alice", houses: 0, hasHotel: false, isMortgaged: false } },
    };
  }

  it("derives the winner's result from the replayed state, not from any client claim", () => {
    const derived = deriveGameResult(finishedGame(), "alice");
    expect(derived).not.toBeNull();
    expect(derived?.won).toBe(true);
    expect(derived?.rank).toBe(1);
    expect(derived?.reason).toBe("last-player-standing");
    expect(derived?.rounds).toBe(12);
    expect(derived?.playerCount).toBe(2);
    expect(derived?.mode).toBe(CLASSIC_MODE.id);
    expect(derived?.cities).toEqual([getTile(1).name]);
    expect(derived?.netWorth).toBeGreaterThan(0);
  });

  it("gives the loser won=false and last place, from the same state", () => {
    const derived = deriveGameResult(finishedGame(), "bob");
    expect(derived?.won).toBe(false);
    expect(derived?.rank).toBe(2);
    expect(derived?.cities).toEqual([]);
  });

  it("reports a cap finish when nobody went bankrupt", () => {
    const state: GameState = {
      ...finishedGame(),
      players: replayToCurrentState(seed, CLASSIC_MODE, playerIds, []).players,
    };
    expect(deriveGameResult(state, "alice")?.reason).toBe("net-worth-at-cap");
  });

  it("refuses a game that isn't over, and a user who wasn't in it", () => {
    const live = replayToCurrentState(seed, CLASSIC_MODE, playerIds, []);
    expect(deriveGameResult(live, "alice")).toBeNull(); // still playing
    expect(deriveGameResult(finishedGame(), "mallory")).toBeNull(); // never seated
  });
});

describe("planTakeoverActions", () => {
  const seed = "takeover-seed";
  const playerIds = ["alice", "bob"] as const;
  const fresh = () => replayToCurrentState(seed, CLASSIC_MODE, playerIds, []);

  it("plays the stalled player's turn until the turn passes on", () => {
    const state = fresh();
    expect(getActingPlayerId(state)).toBe("alice");

    const { actions, finalState } = planTakeoverActions(state, "alice", "s1");

    expect(actions.length).toBeGreaterThan(0);
    expect(actions.length).toBeLessThanOrEqual(MAX_TAKEOVER_ACTIONS);
    // It rolled for them, and it stopped once alice was no longer acting.
    expect(actions[0]?.type).toBe("RollDice");
    expect(getActingPlayerId(finalState)).not.toBe("alice");
    // Every action is attributed to the absent player, never the caller.
    expect(actions.every((a) => actorIdForAction(a) === "alice")).toBe(true);
  });

  it("produces a log the engine accepts, matching finalState exactly", () => {
    const { actions, finalState } = planTakeoverActions(fresh(), "alice", "s2");
    // Replay is the real contract: these actions get appended to game_actions and
    // every client rebuilds from them.
    const replayed = replayToCurrentState(seed, CLASSIC_MODE, playerIds, actions);
    expect(replayed).toEqual(finalState);
  });

  it("is deterministic — a retried call plans the identical turn", () => {
    const a = planTakeoverActions(fresh(), "alice", "same-seed");
    const b = planTakeoverActions(fresh(), "alice", "same-seed");
    expect(a.actions).toEqual(b.actions);

    const c = planTakeoverActions(fresh(), "alice", "other-seed");
    expect(c.actions.length).toBeGreaterThan(0); // still a valid turn
  });

  it("does nothing when it isn't the named player's turn", () => {
    const state = fresh(); // alice is acting
    const { actions, finalState } = planTakeoverActions(state, "bob", "s3");
    expect(actions).toEqual([]);
    expect(finalState).toBe(state);
  });

  it("does nothing once the game is over", () => {
    const over: GameState = { ...fresh(), turnPhase: "game-over", winnerId: "alice" };
    expect(planTakeoverActions(over, "alice", "s4").actions).toEqual([]);
  });
});
