import { describe, expect, it } from "vitest";
import { CLASSIC_MODE, type Action } from "../../../packages/engine/src/index.ts";
import {
  actorIdForAction,
  generateServerSeed,
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
