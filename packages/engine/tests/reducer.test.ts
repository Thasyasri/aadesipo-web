import { describe, expect, it } from "vitest";
import {
  applyAction,
  createInitialState,
  resolveLandedTile,
  MAX_EVENT_CHAIN_DEPTH,
  type EventTables,
} from "../src/core/reducer.js";
import type { Action, GameEvent, GameState, PropertyOwnership } from "../src/core/types.js";
import {
  BOARD,
  CLASSIC_MODE,
  QUICK_MODE,
  MARATHON_MODE,
  GAME_MODES,
  GO_SALARY,
  DEFAULT_HOUSE_RULES,
  getTile,
} from "../src/economy/index.js";
import { checkWinCondition } from "../src/rules/win.js";
import { currentSalary } from "../src/rules/movement.js";
import { totalMoneyInSystem } from "../src/rules/money.js";
import {
  calculateRent,
  canBuildOnProperty,
  canBuildEvenly,
  canSellEvenly,
  netWorth,
} from "../src/rules/property.js";
import { createRngState } from "../src/rng/index.js";
import { CHANCE_TABLE, FUNNY_TABLE, applyEventEffect } from "../src/events/index.js";

/**
 * Rolls repeatedly across RNG seeds until `playerId` rolls a total of
 * `targetSum`, returning the resolved action result. The event system is
 * now a pure function of the dice sum, so this lets a test pin down the
 * exact card that fires without any random draw of its own.
 */
function rollForSum(
  base: GameState,
  playerId: string,
  targetSum: number,
): ReturnType<typeof applyAction> {
  for (let seed = 0; seed < 5000; seed++) {
    const trial: GameState = { ...base, rng: createRngState(seed) };
    const result = applyAction(trial, { type: "RollDice", playerId });
    if (!result.ok) continue;
    const dice = result.events.find((e) => e.type === "DiceRolled");
    if (dice && dice.type === "DiceRolled" && dice.die1 + dice.die2 === targetSum) {
      return result;
    }
  }
  throw new Error(`No seed produced a roll summing to ${targetSum}`);
}

function placeAt(state: GameState, playerId: string, position: number): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, position } : p)),
  };
}

function freshGame(playerIds: readonly string[] = ["p1", "p2"]): GameState {
  return createInitialState("test-seed", CLASSIC_MODE, playerIds);
}

describe("createInitialState", () => {
  it("gives every player the mode's starting cash and rejects bad player counts", () => {
    const state = freshGame(["a", "b", "c"]);
    expect(state.players).toHaveLength(3);
    expect(state.players.every((p) => p.cash === CLASSIC_MODE.startingCash)).toBe(true);
    expect(() => createInitialState("s", CLASSIC_MODE, ["only-one"])).toThrow();
    expect(() => createInitialState("s", CLASSIC_MODE, ["a", "b", "c", "d", "e", "f"])).toThrow();
  });

  it("is deterministic for the same seed", () => {
    expect(freshGame()).toEqual(freshGame());
  });
});

describe("turn order and RollDice", () => {
  it("rejects actions from a player who isn't the current player", () => {
    const state = freshGame();
    const result = applyAction(state, { type: "RollDice", playerId: "p2" });
    expect(result.ok).toBe(false);
  });

  it("moves the player and emits DiceRolled + PlayerMoved events", () => {
    const state = freshGame();
    const result = applyAction(state, { type: "RollDice", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.some((e) => e.type === "DiceRolled")).toBe(true);
    expect(result.events.some((e) => e.type === "PlayerMoved")).toBe(true);
  });

  it("pays GO salary when a player passes GO", () => {
    let state = freshGame();
    state = {
      ...state,
      players: state.players.map((p) => (p.id === "p1" ? { ...p, position: 39 } : p)),
    };
    const result = applyAction(state, { type: "RollDice", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.some((e) => e.type === "PassedGo")).toBe(true);
  });
});

describe("jail", () => {
  it("sends a player to jail on their third consecutive doubles (searched across seeds)", () => {
    let found = false;
    for (let seed = 0; seed < 3000 && !found; seed++) {
      let state = { ...freshGame(), rng: createRngState(seed) };
      // Force three RollDice calls in a row for p1 by keeping turnPhase
      // "awaiting-roll" between calls only when doubles occurred (which
      // is what the reducer already does) — if a non-doubles roll ends
      // the sequence early, this seed just won't reach 3-in-a-row, and
      // we try the next one.
      for (let i = 0; i < 3; i++) {
        if (state.turnPhase !== "awaiting-roll") break;
        const result = applyAction(state, { type: "RollDice", playerId: "p1" });
        if (!result.ok) break;
        state = result.state;
        if (result.events.some((e) => e.type === "SentToJail")) {
          found = true;
          const p1 = state.players.find((p) => p.id === "p1")!;
          expect(p1.inJail).toBe(true);
          expect(state.doublesStreak).toBe(0);
          break;
        }
      }
    }
    expect(found).toBe(true);
  });

  it("releases a jailed player who rolls doubles", () => {
    const base: GameState = {
      ...freshGame(),
      players: freshGame().players.map((p) =>
        p.id === "p1" ? { ...p, inJail: true, jailTurnsRemaining: 3, position: 10 } : p,
      ),
    };

    let found = false;
    for (let seed = 0; seed < 200 && !found; seed++) {
      const trial = { ...base, rng: createRngState(seed) };
      const result = applyAction(trial, { type: "RollDice", playerId: "p1" });
      if (result.ok && result.events.some((e) => e.type === "ReleasedFromJail")) {
        found = true;
        const player = result.state.players.find((p) => p.id === "p1")!;
        expect(player.inJail).toBe(false);
      }
    }
    expect(found).toBe(true);
  });

  it("goes bankrupt to the bank if bail can't be paid on the third failed jail attempt", () => {
    let state = freshGame();
    state = {
      ...state,
      players: state.players.map((p) =>
        p.id === "p1" ? { ...p, inJail: true, jailTurnsRemaining: 1, cash: 0, position: 10 } : p,
      ),
    };
    // Search for a non-doubles seed so this exercises the "must pay or go
    // bankrupt" branch rather than the doubles-release branch.
    for (let seed = 0; seed < 200; seed++) {
      const trial = { ...state, rng: createRngState(seed) };
      const result = applyAction(trial, { type: "RollDice", playerId: "p1" });
      if (!result.ok) continue;
      if (result.events.some((e) => e.type === "PlayerBankrupted")) {
        const p1 = result.state.players.find((p) => p.id === "p1")!;
        expect(p1.isBankrupt).toBe(true);
        return;
      }
    }
    throw new Error("No seed in range produced the expected bankruptcy-in-jail path");
  });
});

describe("property purchase and rent", () => {
  it("lets the current player buy an unowned property they landed on, conserving total money", () => {
    let state = freshGame();
    state = {
      ...state,
      players: state.players.map((p) => (p.id === "p1" ? { ...p, position: 1 } : p)),
      turnPhase: "awaiting-tile-decision",
    };
    const before = totalMoneyInSystem(state);
    const result = applyAction(state, { type: "BuyProperty", playerId: "p1", position: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.properties[1]?.ownerId).toBe("p1");
    expect(totalMoneyInSystem(result.state)).toBe(before);
  });

  it("charges rent when a roll lands a player on another player's property (searched across seeds)", () => {
    const base: GameState = {
      ...freshGame(),
      properties: { 1: { ownerId: "p2", houses: 0, hasHotel: false, isMortgaged: false } },
      players: freshGame().players.map((p) => (p.id === "p1" ? { ...p, position: 40 - 1 } : p)),
    };
    // p1 sits one tile before position 0 isn't useful; instead place p1
    // directly adjacent to position 1 by putting them at position 0 and
    // searching for a seed whose first die alone would land exactly on
    // 1 is unreliable (two dice sum to >=2) — so instead place p1 at
    // position -1 equivalent (39) and search for a roll of exactly 2.
    for (let seed = 0; seed < 500; seed++) {
      const trial: GameState = {
        ...base,
        players: base.players.map((p) => (p.id === "p1" ? { ...p, position: 39 } : p)),
        rng: createRngState(seed),
      };
      const before = totalMoneyInSystem(trial);
      const result = applyAction(trial, { type: "RollDice", playerId: "p1" });
      if (!result.ok) continue;
      const rentEvent = result.events.find((e) => e.type === "RentPaid");
      if (rentEvent && rentEvent.type === "RentPaid") {
        expect(rentEvent.toId).toBe("p2");
        expect(rentEvent.fromId).toBe("p1");
        expect(totalMoneyInSystem(result.state)).toBe(before);
        return;
      }
    }
    throw new Error("No seed in range produced a landing on the rented property");
  });
});

describe("bankruptcy", () => {
  it("transfers a bankrupt player's cash and properties to the bank on voluntary bankruptcy", () => {
    let state = freshGame();
    state = {
      ...state,
      properties: { 1: { ownerId: "p1", houses: 0, hasHotel: false, isMortgaged: false } },
      players: state.players.map((p) => (p.id === "p1" ? { ...p, cash: 5 } : p)),
    };
    const before = totalMoneyInSystem(state);
    const result = applyAction(state, { type: "DeclareBankruptcy", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.isBankrupt).toBe(true);
    expect(p1.cash).toBe(0);
    expect(result.state.properties[1]?.ownerId).toBeNull();
    expect(totalMoneyInSystem(result.state)).toBe(before);
  });

  it("ends the game when only one non-bankrupt player remains", () => {
    const state = freshGame(["p1", "p2"]);
    const result = applyAction(state, { type: "DeclareBankruptcy", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.turnPhase).toBe("game-over");
    expect(result.state.winnerId).toBe("p2");
    expect(result.events.some((e) => e.type === "GameEnded")).toBe(true);
  });
});

describe("raise-funds before bankruptcy", () => {
  // p1 starts at 36 and rolls a (non-doubles) 3 onto Taj Mahal (39), owned by
  // p2, owing base rent it can't cover in cash.
  function landOnRentedTaj(p1Owns: Record<number, boolean>): {
    rolled: ReturnType<typeof applyAction>;
    before: number;
  } {
    const props: GameState["properties"] = {
      39: { ownerId: "p2", houses: 0, hasHotel: false, isMortgaged: false },
    };
    for (const pos of Object.keys(p1Owns).map(Number)) {
      props[pos] = { ownerId: "p1", houses: 0, hasHotel: false, isMortgaged: false };
    }
    const base: GameState = {
      ...freshGame(),
      properties: props,
      players: freshGame().players.map((p) =>
        p.id === "p1" ? { ...p, cash: 5, position: 36 } : p,
      ),
    };
    for (let seed = 0; seed < 3000; seed++) {
      const trial: GameState = { ...base, rng: createRngState(seed) };
      const before = totalMoneyInSystem(trial);
      const rolled = applyAction(trial, { type: "RollDice", playerId: "p1" });
      if (!rolled.ok) continue;
      const dice = rolled.events.find((e) => e.type === "DiceRolled");
      if (dice?.type === "DiceRolled" && dice.die1 + dice.die2 === 3 && dice.die1 !== dice.die2) {
        return { rolled, before };
      }
    }
    throw new Error("No seed produced the non-doubles rent landing on 39");
  }

  it("pauses to let a cash-short but asset-rich player mortgage and pay, instead of bankrupting them", () => {
    const { rolled, before } = landOnRentedTaj({ 1: true }); // p1 owns Nizamabad (mortgageable)
    expect(rolled.ok).toBe(true);
    if (!rolled.ok) return;
    let s = rolled.state;

    expect(s.turnPhase).toBe("resolving-debt");
    expect(s.pendingDebt?.debtorId).toBe("p1");
    expect(s.pendingDebt?.creditorId).toBe("p2");
    expect(s.players.find((p) => p.id === "p1")!.isBankrupt).toBe(false);
    expect(rolled.events.some((e) => e.type === "DebtIncurred")).toBe(true);

    // Can't settle before raising the cash.
    expect(applyAction(s, { type: "SettleDebt", playerId: "p1" }).ok).toBe(false);

    // Mortgage to raise funds, then settle.
    const mortgaged = applyAction(s, { type: "MortgageProperty", playerId: "p1", position: 1 });
    expect(mortgaged.ok).toBe(true);
    if (!mortgaged.ok) return;
    s = mortgaged.state;

    const settled = applyAction(s, { type: "SettleDebt", playerId: "p1" });
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    s = settled.state;

    expect(s.pendingDebt).toBeNull();
    expect(s.players.find((p) => p.id === "p1")!.isBankrupt).toBe(false);
    expect(settled.events.some((e) => e.type === "RentPaid")).toBe(true);
    expect(s.properties[39]?.ownerId).toBe("p2");
    // Money is conserved across the whole roll → mortgage → settle sequence.
    expect(totalMoneyInSystem(s)).toBe(before);
  });

  it("still bankrupts immediately when even full liquidation cannot cover the debt", () => {
    const { rolled, before } = landOnRentedTaj({}); // p1 owns nothing to liquidate
    expect(rolled.ok).toBe(true);
    if (!rolled.ok) return;
    const s = rolled.state;

    expect(s.turnPhase).not.toBe("resolving-debt");
    expect(s.pendingDebt).toBeNull();
    expect(rolled.events.some((e) => e.type === "PlayerBankrupted")).toBe(true);
    expect(s.players.find((p) => p.id === "p1")!.isBankrupt).toBe(true);
    expect(totalMoneyInSystem(s)).toBe(before);
  });
});

describe("mortgage and building", () => {
  it("mortgaging pays the player and unmortgaging costs 110% of mortgage value, conserving money", () => {
    let state = freshGame();
    state = {
      ...state,
      properties: { 1: { ownerId: "p1", houses: 0, hasHotel: false, isMortgaged: false } },
    };
    const before = totalMoneyInSystem(state);

    const mortgageResult = applyAction(state, {
      type: "MortgageProperty",
      playerId: "p1",
      position: 1,
    });
    expect(mortgageResult.ok).toBe(true);
    if (!mortgageResult.ok) return;
    expect(mortgageResult.state.properties[1]?.isMortgaged).toBe(true);
    expect(totalMoneyInSystem(mortgageResult.state)).toBe(before);

    const unmortgageResult = applyAction(mortgageResult.state, {
      type: "UnmortgageProperty",
      playerId: "p1",
      position: 1,
    });
    expect(unmortgageResult.ok).toBe(true);
    if (!unmortgageResult.ok) return;
    expect(unmortgageResult.state.properties[1]?.isMortgaged).toBe(false);
    expect(totalMoneyInSystem(unmortgageResult.state)).toBe(before);
  });

  it("rejects building before the global 17-of-22 property unlock is reached", () => {
    let state = freshGame();
    state = {
      ...state,
      properties: { 1: { ownerId: "p1", houses: 0, hasHotel: false, isMortgaged: false } },
    };
    const result = applyAction(state, { type: "BuildHouse", playerId: "p1", position: 1 });
    expect(result.ok).toBe(false);
  });

  it("allows building once 17 color properties are owned collectively, even without owning the full group", () => {
    const propertyPositions = BOARD.filter((tile) => tile.type === "property").map(
      (tile) => tile.position,
    );
    const ownedPositions = [
      1,
      ...propertyPositions.filter((position) => position !== 1 && position !== 3).slice(0, 16),
    ];

    let state = freshGame();
    state = {
      ...state,
      properties: Object.fromEntries(
        ownedPositions.map((position) => [
          position,
          { ownerId: "p1", houses: 0, hasHotel: false, isMortgaged: false },
        ]),
      ),
    };

    const result = applyAction(state, { type: "BuildHouse", playerId: "p1", position: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.properties[1]?.houses).toBe(1);
  });

  it("only doubles base rent for 3+ same-color ownership and not for house tiers", () => {
    // Positions 6, 8, 14 are the three light-blue tiles after the adjacency
    // remap (9 moved to pink, 14 moved in from pink).
    const tile = getTile(6);
    let state = freshGame();
    state = {
      ...state,
      properties: {
        6: { ownerId: "p1", houses: 0, hasHotel: false, isMortgaged: false },
        8: { ownerId: "p1", houses: 0, hasHotel: false, isMortgaged: false },
        14: { ownerId: "p1", houses: 0, hasHotel: false, isMortgaged: false },
      },
    };

    expect(calculateRent(state, 6, 0)).toBe(tile.rent.base * 2);

    const withHouseState = {
      ...state,
      properties: {
        ...state.properties,
        6: { ...state.properties[6]!, houses: 1 },
      },
    };
    expect(calculateRent(withHouseState, 6, 0)).toBe(tile.rent.oneHouse);
  });

  it("builds a house once the unlock is reached, and selling refunds half cost", () => {
    const propertyPositions = BOARD.filter((tile) => tile.type === "property").map(
      (tile) => tile.position,
    );
    const ownedPositions = [
      1,
      ...propertyPositions.filter((position) => position !== 1 && position !== 3).slice(0, 16),
    ];

    let state = freshGame();
    state = {
      ...state,
      properties: Object.fromEntries(
        ownedPositions.map((position) => [
          position,
          { ownerId: "p1", houses: 0, hasHotel: false, isMortgaged: false },
        ]),
      ),
    };
    const before = totalMoneyInSystem(state);
    const buildResult = applyAction(state, { type: "BuildHouse", playerId: "p1", position: 1 });
    expect(buildResult.ok).toBe(true);
    if (!buildResult.ok) return;
    expect(buildResult.state.properties[1]?.houses).toBe(1);
    expect(totalMoneyInSystem(buildResult.state)).toBe(before);

    const sellResult = applyAction(buildResult.state, {
      type: "SellHouse",
      playerId: "p1",
      position: 1,
    });
    expect(sellResult.ok).toBe(true);
    if (!sellResult.ok) return;
    expect(sellResult.state.properties[1]?.houses).toBe(0);
    expect(totalMoneyInSystem(sellResult.state)).toBe(before);
  });
});

describe("trading", () => {
  it("executes a trade only once both sides can actually deliver, and conserves money", () => {
    let state = freshGame();
    state = {
      ...state,
      properties: { 1: { ownerId: "p1", houses: 0, hasHotel: false, isMortgaged: false } },
    };
    const before = totalMoneyInSystem(state);

    const proposeResult = applyAction(state, {
      type: "ProposeTrade",
      proposerId: "p1",
      recipientId: "p2",
      proposerGives: { cash: 0, propertyPositions: [1] },
      recipientGives: { cash: 100, propertyPositions: [] },
    });
    expect(proposeResult.ok).toBe(true);
    if (!proposeResult.ok) return;

    const tradeId = proposeResult.state.pendingTrade!.id;
    const acceptResult = applyAction(proposeResult.state, {
      type: "AcceptTrade",
      playerId: "p2",
      tradeId,
    });
    expect(acceptResult.ok).toBe(true);
    if (!acceptResult.ok) return;

    expect(acceptResult.state.properties[1]?.ownerId).toBe("p2");
    expect(totalMoneyInSystem(acceptResult.state)).toBe(before);
  });

  it("rejects a trade proposal for a property the proposer doesn't own", () => {
    const state = freshGame();
    const result = applyAction(state, {
      type: "ProposeTrade",
      proposerId: "p1",
      recipientId: "p2",
      proposerGives: { cash: 0, propertyPositions: [1] },
      recipientGives: { cash: 100, propertyPositions: [] },
    });
    expect(result.ok).toBe(false);
  });

  it("trades a get-out-of-jail-free card between players, conserving money", () => {
    // p1 gives p2 a jail-free card; p2 pays cash for it.
    const base: GameState = {
      ...freshGame(),
      players: freshGame().players.map((p) => (p.id === "p1" ? { ...p, jailFreeCards: 1 } : p)),
    };
    const before = totalMoneyInSystem(base);
    const proposed = applyAction(base, {
      type: "ProposeTrade",
      proposerId: "p1",
      recipientId: "p2",
      proposerGives: { cash: 0, propertyPositions: [], jailFreeCards: 1 },
      recipientGives: { cash: 60, propertyPositions: [] },
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    const accepted = applyAction(proposed.state, {
      type: "AcceptTrade",
      playerId: "p2",
      tradeId: proposed.state.pendingTrade!.id,
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    const p1 = accepted.state.players.find((p) => p.id === "p1")!;
    const p2 = accepted.state.players.find((p) => p.id === "p2")!;
    expect(p1.jailFreeCards).toBe(0);
    expect(p2.jailFreeCards).toBe(1);
    expect(p1.cash).toBe(1500 + 60);
    expect(p2.cash).toBe(1500 - 60);
    expect(totalMoneyInSystem(accepted.state)).toBe(before);
  });

  it("rejects a trade offering more jail-free cards than the player holds", () => {
    const result = applyAction(freshGame(), {
      type: "ProposeTrade",
      proposerId: "p1",
      recipientId: "p2",
      proposerGives: { cash: 0, propertyPositions: [], jailFreeCards: 1 },
      recipientGives: { cash: 0, propertyPositions: [] },
    });
    expect(result.ok).toBe(false);
  });

  it("assigns deterministic trade ids so a proposed trade survives replay", () => {
    const base: GameState = {
      ...freshGame(),
      properties: {
        1: { ownerId: "p1", houses: 0, hasHotel: false, isMortgaged: false },
      },
    };
    // Propose, then accept referencing the *deterministic* id — a random UUID
    // would differ on replay and break the follow-up accept.
    const actions: Action[] = [
      {
        type: "ProposeTrade",
        proposerId: "p1",
        recipientId: "p2",
        proposerGives: { cash: 0, propertyPositions: [1] },
        recipientGives: { cash: 100, propertyPositions: [] },
      },
      { type: "AcceptTrade", playerId: "p2", tradeId: "trade-1" },
    ];
    const run = (s: GameState) =>
      actions.reduce((st, a) => {
        const r = applyAction(st, a);
        if (!r.ok) throw new Error(r.reason);
        return r.state;
      }, s);

    const first = run(base);
    const second = run(base);
    expect(first.properties[1]?.ownerId).toBe("p2");
    expect(first.pendingTrade).toBeNull();
    expect(first.tradeSeq).toBe(1);
    // Byte-identical replay — the whole point of a deterministic id.
    expect(first).toEqual(second);
  });
});

describe("deterministic event tables", () => {
  it("resolves a Chance tile purely from the dice sum with no random draw", () => {
    // Chance tile at position 7. From GO, a roll of 7 lands there.
    const base = placeAt(freshGame(), "p1", 0);
    const before = totalMoneyInSystem(base);
    const result = rollForSum(base, "p1", 7);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const card = result.events.find((e) => e.type === "EventCardResolved");
    expect(card && card.type === "EventCardResolved" && card.text).toBe(CHANCE_TABLE[7]!.text);
    // Sum 7 → collect 200 from the bank.
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.cash).toBe(CLASSIC_MODE.startingCash + 200);
    expect(totalMoneyInSystem(result.state)).toBe(before);
  });

  it("gives the same outcome for the same dice sum every time (determinism)", () => {
    // Place p1 so a roll of 7 lands on the same Chance tile twice, from
    // two entirely different RNG seeds — outcome must be identical.
    const base = placeAt(freshGame(), "p1", 0);
    const a = rollForSum(base, "p1", 7);
    const b = rollForSum({ ...base, rng: createRngState(99999) }, "p1", 7);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const cardA = a.events.find((e) => e.type === "EventCardResolved");
    const cardB = b.events.find((e) => e.type === "EventCardResolved");
    expect(cardA).toEqual(cardB);
  });
});

describe("event movement effects", () => {
  it("advance-to-nearest-transit lands on the transit and prompts a purchase when unowned", () => {
    // Chance at 22; a roll of 8 from position 14 lands there. Sum 8 →
    // advance to nearest transit (25), which is unowned by default.
    const base = placeAt(freshGame(), "p1", 14);
    const result = rollForSum(base, "p1", 8);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.events.some((e) => e.type === "EventCardResolved")).toBe(true);
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.position).toBe(25);
    expect(result.state.turnPhase).toBe("awaiting-tile-decision");
  });

  it("advance-to-nearest-transit pays rent when the transit is owned by another player", () => {
    let base = placeAt(freshGame(), "p1", 14);
    base = {
      ...base,
      properties: { 25: { ownerId: "p2", houses: 0, hasHotel: false, isMortgaged: false } },
    };
    const before = totalMoneyInSystem(base);
    const result = rollForSum(base, "p1", 8);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rent = result.events.find((e) => e.type === "RentPaid");
    expect(rent && rent.type === "RentPaid" && rent.position).toBe(25);
    expect(rent && rent.type === "RentPaid" && rent.toId).toBe("p2");
    expect(totalMoneyInSystem(result.state)).toBe(before);
  });

  it("move-back-n-spaces pays rent on the property it lands on", () => {
    // Chance at 22; roll of 9 from position 13 lands there. Sum 9 → move
    // back 3 → position 19, which we make p2's property.
    let base = placeAt(freshGame(), "p1", 13);
    base = {
      ...base,
      properties: { 19: { ownerId: "p2", houses: 0, hasHotel: false, isMortgaged: false } },
    };
    const before = totalMoneyInSystem(base);
    const result = rollForSum(base, "p1", 9);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.position).toBe(19);
    const rent = result.events.find((e) => e.type === "RentPaid");
    expect(rent && rent.type === "RentPaid" && rent.position).toBe(19);
    expect(rent && rent.type === "RentPaid" && rent.fromId).toBe("p1");
    expect(totalMoneyInSystem(result.state)).toBe(before);
  });

  it("move-back-n-spaces prompts a purchase when it lands on an unowned property", () => {
    const base = placeAt(freshGame(), "p1", 13);
    const result = rollForSum(base, "p1", 9);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.position).toBe(19);
    expect(result.state.turnPhase).toBe("awaiting-tile-decision");
  });

  it("go-to-jail sends the player straight to jail", () => {
    // Funny at 17; roll of 11 from position 6 lands there. Sum 11 → jail.
    const base = placeAt(freshGame(), "p1", 6);
    const result = rollForSum(base, "p1", 11);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const card = result.events.find((e) => e.type === "EventCardResolved");
    expect(card && card.type === "EventCardResolved" && card.text).toBe(FUNNY_TABLE[11]!.text);
    expect(result.events.some((e) => e.type === "SentToJail")).toBe(true);
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.inJail).toBe(true);
    expect(p1.position).toBe(10);
  });

  it("grant-jail-free-card gives the player a jail-free card", () => {
    // Funny at 17; roll of 8 from position 9 lands there. Sum 8 → card.
    const base = placeAt(freshGame(), "p1", 9);
    const result = rollForSum(base, "p1", 8);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.jailFreeCards).toBe(1);
  });

  it("throws a clear error if an event chain would recurse past the safety cap", () => {
    // A deliberately cyclic table: landing on the Chance tile at 7 always
    // moves the player back 0 spaces — i.e. right back onto tile 7 — so the
    // chain would recurse forever if unguarded. With the real tables this
    // is impossible (they terminate at depth 2); we inject a fake looping
    // table to prove the backstop fires instead of hanging the game.
    const loopingTables: EventTables = {
      chance: {
        7: { text: "infinite loop card", effect: { kind: "move-back-n-spaces", spaces: 0 } },
      },
      funny: {},
    };
    const state = placeAt(freshGame(), "p1", 7); // position 7 is a Chance tile
    const events: GameEvent[] = [];

    expect(() => resolveLandedTile(state, "p1", 7, events, 0, loopingTables)).toThrow(
      /safety cap of 3/,
    );
    // Sanity-check the cap constant the message and guard are keyed to.
    expect(MAX_EVENT_CHAIN_DEPTH).toBe(3);
  });

  it("chains a second event when movement lands on another event tile, conserving money", () => {
    // Chance at 36; roll of 9 from position 27 lands there. Sum 9 → move
    // back 3 → position 33 (a Funny-Event tile) → Funny sum 9 fires too.
    const base = placeAt(freshGame(["p1", "p2"]), "p1", 27);
    const before = totalMoneyInSystem(base);
    const result = rollForSum(base, "p1", 9);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const cards = result.events.filter((e) => e.type === "EventCardResolved");
    expect(cards).toHaveLength(2);
    expect(cards[0] && cards[0].type === "EventCardResolved" && cards[0].deck).toBe("chance");
    expect(cards[1] && cards[1].type === "EventCardResolved" && cards[1].deck).toBe("funny");
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.position).toBe(33);
    // Funny sum 9 → pay 30 to each player; money is conserved either way.
    expect(totalMoneyInSystem(result.state)).toBe(before);
  });
});

describe("richer event effects", () => {
  it("street repairs charges per house and per hotel, conserving money", () => {
    const base: GameState = {
      ...freshGame(),
      properties: {
        1: { ownerId: "p1", houses: 3, hasHotel: false, isMortgaged: false },
        3: { ownerId: "p1", houses: 0, hasHotel: true, isMortgaged: false },
      },
    };
    const before = totalMoneyInSystem(base);
    const { state, events } = applyEventEffect(base, "p1", {
      kind: "street-repairs",
      perHouse: 25,
      perHotel: 100,
    });
    // 3 houses * 25 + 1 hotel * 100 = 175.
    const p1 = state.players.find((p) => p.id === "p1")!;
    expect(p1.cash).toBe(1500 - 175);
    const tax = events.find((e) => e.type === "TaxPaid");
    expect(tax && tax.type === "TaxPaid" && tax.amount).toBe(175);
    expect(totalMoneyInSystem(state)).toBe(before);
  });

  it("street repairs is free when the player has built nothing", () => {
    const base: GameState = {
      ...freshGame(),
      properties: { 1: { ownerId: "p1", houses: 0, hasHotel: false, isMortgaged: false } },
    };
    const { state, events } = applyEventEffect(base, "p1", {
      kind: "street-repairs",
      perHouse: 25,
      perHotel: 100,
    });
    expect(state.players.find((p) => p.id === "p1")!.cash).toBe(1500);
    expect(events.some((e) => e.type === "TaxPaid")).toBe(false);
  });

  it("collect-per-property takes from each rival scaled by how many you own", () => {
    const base: GameState = {
      ...freshGame(["p1", "p2", "p3"]),
      properties: {
        1: { ownerId: "p1", houses: 0, hasHotel: false, isMortgaged: false },
        3: { ownerId: "p1", houses: 0, hasHotel: false, isMortgaged: false },
        6: { ownerId: "p1", houses: 0, hasHotel: false, isMortgaged: false },
      },
    };
    const before = totalMoneyInSystem(base);
    const { state } = applyEventEffect(base, "p1", { kind: "collect-per-property", amount: 15 });
    // p1 owns 3 -> 45 per rival; two rivals -> +90 for p1, -45 each.
    expect(state.players.find((p) => p.id === "p1")!.cash).toBe(1500 + 90);
    expect(state.players.find((p) => p.id === "p2")!.cash).toBe(1500 - 45);
    expect(state.players.find((p) => p.id === "p3")!.cash).toBe(1500 - 45);
    expect(totalMoneyInSystem(state)).toBe(before);
  });

  it("advance-to-tile moves forward to GO (collecting salary) and resolves it", () => {
    // Chance at 7; a roll of 6 from position 1 lands there. Sum 6 -> advance to GO.
    const base = placeAt(freshGame(), "p1", 1);
    const before = totalMoneyInSystem(base);
    const result = rollForSum(base, "p1", 6);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.position).toBe(0);
    expect(result.events.some((e) => e.type === "EventCardResolved")).toBe(true);
    expect(result.events.some((e) => e.type === "PassedGo")).toBe(true);
    expect(totalMoneyInSystem(result.state)).toBe(before);
  });

  it("advance-to-tile pays rent when the target tile is owned by a rival", () => {
    // Chance at 36; a roll of 11 from position 25 lands there. Sum 11 ->
    // advance to Taj Mahal (39), which we make p2's property.
    let base = placeAt(freshGame(), "p1", 25);
    base = {
      ...base,
      properties: { 39: { ownerId: "p2", houses: 0, hasHotel: false, isMortgaged: false } },
    };
    const before = totalMoneyInSystem(base);
    const result = rollForSum(base, "p1", 11);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players.find((p) => p.id === "p1")!.position).toBe(39);
    const rent = result.events.find((e) => e.type === "RentPaid");
    expect(rent && rent.type === "RentPaid" && rent.toId).toBe("p2");
    expect(rent && rent.type === "RentPaid" && rent.position).toBe(39);
    expect(totalMoneyInSystem(result.state)).toBe(before);
  });
});

describe("auctions", () => {
  it("runs a full decline -> auction -> win cycle, transferring ownership and conserving money", () => {
    let state = freshGame(["p1", "p2", "p3"]);
    state = {
      ...state,
      players: state.players.map((p) => (p.id === "p1" ? { ...p, position: 1 } : p)),
      turnPhase: "awaiting-tile-decision",
    };
    const before = totalMoneyInSystem(state);

    const decline = applyAction(state, { type: "DeclineProperty", playerId: "p1", position: 1 });
    expect(decline.ok).toBe(true);
    if (!decline.ok) return;
    expect(decline.state.turnPhase).toBe("awaiting-auction");
    const firstBidder = decline.state.pendingAuction!.turnBidderId;

    const bid = applyAction(decline.state, { type: "PlaceBid", playerId: firstBidder, amount: 50 });
    expect(bid.ok).toBe(true);
    if (!bid.ok) return;

    // Everyone else passes in turn until the auction resolves.
    let current = bid.state;
    let guard = 0;
    while (current.pendingAuction && guard < 10) {
      const bidderId = current.pendingAuction.turnBidderId;
      const result = applyAction(current, { type: "PassAuction", playerId: bidderId });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      current = result.state;
      guard++;
    }

    expect(current.pendingAuction).toBeNull();
    expect(current.properties[1]?.ownerId).toBe(firstBidder);
    expect(totalMoneyInSystem(current)).toBe(before);
  });
});

describe("bank loans", () => {
  // p1 is cash-poor (500) vs p2 (1500), so p1 trails the 1000 average and can
  // borrow up to floor(500 * 0.5) = 250.
  function trailingGame(): GameState {
    const base = createInitialState("loan", CLASSIC_MODE, ["p1", "p2"]);
    return {
      ...base,
      turnPhase: "turn-idle",
      players: base.players.map((p) => (p.id === "p1" ? { ...p, cash: 500 } : p)),
    };
  }

  it("a trailing player borrows cash, and the loan is net-worth-neutral at first", () => {
    const state = trailingGame();
    const before = totalMoneyInSystem(state);
    const nwBefore = netWorth(state, "p1");
    const result = applyAction(state, { type: "TakeLoan", playerId: "p1", amount: 250 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.cash).toBe(750);
    expect(p1.loan).toEqual({ principal: 250, owed: 250 });
    // Cash up 250, owed up 250 -> net worth unchanged; total money conserved.
    expect(netWorth(result.state, "p1")).toBe(nwBefore);
    expect(totalMoneyInSystem(result.state)).toBe(before);
  });

  it("caps the loan at half net worth and refuses a non-trailing player", () => {
    expect(applyAction(trailingGame(), { type: "TakeLoan", playerId: "p1", amount: 251 }).ok).toBe(
      false,
    );
    // The richer p2 isn't trailing, so can't borrow at all.
    const leaderTurn = { ...trailingGame(), currentPlayerIndex: 1 };
    expect(applyAction(leaderTurn, { type: "TakeLoan", playerId: "p2", amount: 50 }).ok).toBe(
      false,
    );
  });

  it("accrues interest on the loan each completed round", () => {
    let state = applyAction(trailingGame(), {
      type: "TakeLoan",
      playerId: "p1",
      amount: 200,
    }).state;
    // Make it p2's turn and end it — that wraps the round and ticks interest.
    state = { ...state, currentPlayerIndex: 1, turnPhase: "turn-idle" };
    const ended = applyAction(state, { type: "EndTurn", playerId: "p2" });
    expect(ended.ok).toBe(true);
    if (!ended.ok) return;
    // +10% of the 200 principal = 20.
    expect(ended.state.players.find((p) => p.id === "p1")!.loan!.owed).toBe(220);
  });

  it("repays the loan (clearing it in full), conserving money", () => {
    const state = applyAction(trailingGame(), { type: "TakeLoan", playerId: "p1", amount: 200 })
      .state as GameState;
    const before = totalMoneyInSystem(state);
    const repaid = applyAction(state, { type: "RepayLoan", playerId: "p1", amount: 200 });
    expect(repaid.ok).toBe(true);
    if (!repaid.ok) return;
    const p1 = repaid.state.players.find((p) => p.id === "p1")!;
    expect(p1.loan).toBeNull();
    expect(p1.cash).toBe(500);
    expect(totalMoneyInSystem(repaid.state)).toBe(before);
    const ev = repaid.events.find((e) => e.type === "LoanRepaid");
    expect(ev && ev.type === "LoanRepaid" && ev.remaining).toBe(0);
  });

  it("writes off the loan when the borrower goes bankrupt, conserving money", () => {
    const before = totalMoneyInSystem(trailingGame());
    const state = applyAction(trailingGame(), { type: "TakeLoan", playerId: "p1", amount: 200 })
      .state as GameState;
    const bankrupt = applyAction(state, { type: "DeclareBankruptcy", playerId: "p1" });
    expect(bankrupt.ok).toBe(true);
    if (!bankrupt.ok) return;
    const p1 = bankrupt.state.players.find((p) => p.id === "p1")!;
    expect(p1.isBankrupt).toBe(true);
    expect(p1.loan).toBeNull();
    expect(totalMoneyInSystem(bankrupt.state)).toBe(before);
  });
});

describe("game modes", () => {
  it("offers classic, quick, and marathon with the intended pacing", () => {
    expect(GAME_MODES.map((m) => m.id)).toEqual(["classic", "quick", "marathon"]);
    // Quick is a shorter, cash-richer game; marathon runs longest.
    expect(QUICK_MODE.maxRounds).toBeLessThan(CLASSIC_MODE.maxRounds);
    expect(MARATHON_MODE.maxRounds).toBeGreaterThan(CLASSIC_MODE.maxRounds);
    expect(QUICK_MODE.startingCash).toBeGreaterThan(CLASSIC_MODE.startingCash);
  });

  it("escalates GO salary on the mode's schedule", () => {
    const quick = createInitialState("mode-q", QUICK_MODE, ["p1", "p2"]);
    // Quick escalates every 4 rounds by 100.
    expect(currentSalary({ ...quick, roundNumber: 0 })).toBe(GO_SALARY);
    expect(currentSalary({ ...quick, roundNumber: 4 })).toBe(GO_SALARY + 100);
    // Classic hasn't escalated yet by round 4 (its cadence is every 10).
    const classic = createInitialState("mode-c", CLASSIC_MODE, ["p1", "p2"]);
    expect(currentSalary({ ...classic, roundNumber: 4 })).toBe(GO_SALARY);
  });

  it("triggers the net-worth win exactly at the mode's round cap", () => {
    const base = createInitialState("mode-cap", QUICK_MODE, ["p1", "p2"]);
    const state = {
      ...base,
      players: base.players.map((p) => (p.id === "p1" ? { ...p, cash: 3000 } : p)),
    };
    // One round before the cap: still going.
    expect(checkWinCondition({ ...state, roundNumber: QUICK_MODE.maxRounds - 1 })).toBeNull();
    // At the cap: the wealthier player wins on net worth.
    const win = checkWinCondition({ ...state, roundNumber: QUICK_MODE.maxRounds });
    expect(win?.reason).toBe("net-worth-at-cap");
    expect(win?.winnerId).toBe("p1");
  });
});

describe("even-building house rule", () => {
  const rules = { ...DEFAULT_HOUSE_RULES, evenBuilding: true };
  const own = (level: number): PropertyOwnership => ({
    ownerId: "p1",
    houses: level === 5 ? 0 : level,
    hasHotel: level === 5,
    isMortgaged: false,
  });

  // Light-blue trio 6/8/14, all owned by p1 at the given levels.
  function trio(levels: [number, number, number]): GameState {
    const base = createInitialState("even", CLASSIC_MODE, ["p1", "p2"], rules);
    return { ...base, properties: { 6: own(levels[0]), 8: own(levels[1]), 14: own(levels[2]) } };
  }

  it("only lets you build on the least-developed property in the group", () => {
    const s = trio([1, 0, 0]);
    expect(canBuildEvenly(s, "p1", 6)).toBe(false); // ahead of the others → blocked
    expect(canBuildEvenly(s, "p1", 8)).toBe(true); // at the minimum → allowed
    expect(canBuildEvenly(s, "p1", 14)).toBe(true);
  });

  it("only lets you sell from the most-developed property in the group", () => {
    const s = trio([2, 1, 1]);
    expect(canSellEvenly(s, "p1", 6)).toBe(true); // the maximum → sellable
    expect(canSellEvenly(s, "p1", 8)).toBe(false); // behind → blocked
  });

  it("is a no-op when the rule is off (classic free-build)", () => {
    const base = createInitialState("even-off", CLASSIC_MODE, ["p1", "p2"]);
    const s: GameState = { ...base, properties: { 6: own(1), 8: own(0), 14: own(0) } };
    expect(canBuildEvenly(s, "p1", 6)).toBe(true);
    expect(canSellEvenly(s, "p1", 8)).toBe(true);
  });

  it("rejects an uneven BuildHouse but accepts the even one, once building is unlocked", () => {
    const propertyPositions = BOARD.filter((t) => t.type === "property").map((t) => t.position);
    const owned = [
      6,
      8,
      14,
      ...propertyPositions.filter((p) => ![6, 8, 14].includes(p)).slice(0, 14),
    ];
    const properties: Record<number, PropertyOwnership> = {};
    for (const p of owned) properties[p] = own(0);
    properties[6] = own(1); // 6 is one ahead of 8/14

    const state: GameState = {
      ...createInitialState("even-int", CLASSIC_MODE, ["p1", "p2"], rules),
      properties,
    };
    expect(applyAction(state, { type: "BuildHouse", playerId: "p1", position: 6 }).ok).toBe(false);
    expect(applyAction(state, { type: "BuildHouse", playerId: "p1", position: 8 }).ok).toBe(true);
  });
});

describe("house rules", () => {
  it("starting-cash preset sets every player's opening bankroll", () => {
    const rules = { ...DEFAULT_HOUSE_RULES, startingCash: 1000 };
    const state = createInitialState("hr-cash", CLASSIC_MODE, ["p1", "p2"], rules);
    expect(state.players.every((p) => p.cash === 1000)).toBe(true);
    // ...and differs from the classic default, so the toggle really bites.
    expect(1000).not.toBe(CLASSIC_MODE.startingCash);
  });

  it("no-auction: a declined property stays unowned and skips the auction", () => {
    let state = createInitialState("hr-noauc", CLASSIC_MODE, ["p1", "p2", "p3"], {
      ...DEFAULT_HOUSE_RULES,
      noAuction: true,
    });
    state = {
      ...state,
      players: state.players.map((p) => (p.id === "p1" ? { ...p, position: 1 } : p)),
      turnPhase: "awaiting-tile-decision",
    };
    const result = applyAction(state, { type: "DeclineProperty", playerId: "p1", position: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.turnPhase).toBe("turn-idle");
    expect(result.state.pendingAuction).toBeNull();
    expect(result.state.properties[1]?.ownerId).toBeUndefined();
  });

  it("free-parking jackpot: tax feeds the pot (not the bank) and is scooped on landing", () => {
    const rules = { ...DEFAULT_HOUSE_RULES, freeParkingJackpot: true };
    // Income Tax sits at position 4 (amount 200); a roll of 4 from GO lands there.
    const taxStart = placeAt(
      createInitialState("hr-pot-a", CLASSIC_MODE, ["p1", "p2"], rules),
      "p1",
      0,
    );
    const beforeTax = totalMoneyInSystem(taxStart);
    const taxed = rollForSum(taxStart, "p1", 4);
    expect(taxed.ok).toBe(true);
    if (!taxed.ok) return;
    expect(taxed.state.players.find((p) => p.id === "p1")!.position).toBe(4);
    // Money moved into the pot, the bank is untouched, and the total is conserved.
    expect(taxed.state.freeParkingPot).toBe(200);
    expect(taxed.state.bank).toBe(taxStart.bank);
    expect(taxed.events.some((e) => e.type === "TaxPaid")).toBe(true);
    expect(totalMoneyInSystem(taxed.state)).toBe(beforeTax);

    // Free Parking sits at position 20; a roll of 4 from position 16 lands there.
    let collectStart = createInitialState("hr-pot-b", CLASSIC_MODE, ["p1", "p2"], rules);
    collectStart = placeAt({ ...collectStart, freeParkingPot: 300 }, "p1", 16);
    const beforeCollect = totalMoneyInSystem(collectStart);
    const collected = rollForSum(collectStart, "p1", 4);
    expect(collected.ok).toBe(true);
    if (!collected.ok) return;
    const collector = collected.state.players.find((p) => p.id === "p1")!;
    expect(collector.position).toBe(20);
    expect(collected.state.freeParkingPot).toBe(0);
    expect(collector.cash).toBe(rules.startingCash + 300);
    const jackpot = collected.events.find((e) => e.type === "JackpotCollected");
    expect(jackpot && jackpot.type === "JackpotCollected" && jackpot.amount).toBe(300);
    expect(totalMoneyInSystem(collected.state)).toBe(beforeCollect);
  });

  it("free-parking jackpot off (classic): tax goes to the bank and the pot stays empty", () => {
    const base = placeAt(freshGame(), "p1", 0);
    const result = rollForSum(base, "p1", 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.freeParkingPot).toBe(0);
    expect(result.state.bank).toBe(base.bank + 200);
  });

  it("double GO salary: landing exactly on GO pays double, merely passing it pays single", () => {
    const rules = { ...DEFAULT_HOUSE_RULES, doubleGoSalary: true };
    // Land exactly on GO: position 36 + 4 = 40 -> wraps to 0.
    const landOn = placeAt(
      createInitialState("hr-go-land", CLASSIC_MODE, ["p1", "p2"], rules),
      "p1",
      36,
    );
    const landed = rollForSum(landOn, "p1", 4);
    expect(landed.ok).toBe(true);
    if (!landed.ok) return;
    expect(landed.state.players.find((p) => p.id === "p1")!.position).toBe(0);
    const doubled = landed.events.find((e) => e.type === "PassedGo");
    expect(doubled && doubled.type === "PassedGo" && doubled.salary).toBe(400);

    // Merely pass GO: position 38 + 4 = 42 -> position 2, salary stays single.
    const passBy = placeAt(
      createInitialState("hr-go-pass", CLASSIC_MODE, ["p1", "p2"], rules),
      "p1",
      38,
    );
    const passed = rollForSum(passBy, "p1", 4);
    expect(passed.ok).toBe(true);
    if (!passed.ok) return;
    const single = passed.events.find((e) => e.type === "PassedGo");
    expect(single && single.type === "PassedGo" && single.salary).toBe(200);
  });
});

describe("finite house & hotel supply", () => {
  const propertyPositions = BOARD.filter((t) => t.type === "property").map((t) => t.position);
  // 17 owned properties reaches the build unlock; keep 1 and 16 for the tests.
  const ownedPositions = [
    1,
    16,
    ...propertyPositions.filter((p) => p !== 1 && p !== 16).slice(0, 15),
  ];

  function unlockedFinite(): GameState {
    const rules = { ...DEFAULT_HOUSE_RULES, finiteBuildings: true };
    const state = createInitialState("fin", CLASSIC_MODE, ["p1", "p2"], rules);
    return {
      ...state,
      properties: Object.fromEntries(
        ownedPositions.map((p) => [
          p,
          { ownerId: "p1", houses: 0, hasHotel: false, isMortgaged: false },
        ]),
      ),
    };
  }

  const totalHouses = (s: GameState) =>
    Object.values(s.properties).reduce((n, o) => n + (o?.houses ?? 0), 0);
  const totalHotels = (s: GameState) =>
    Object.values(s.properties).reduce((n, o) => n + (o?.hasHotel ? 1 : 0), 0);

  it("seeds the bank with 32 houses / 12 hotels only when the rule is on", () => {
    expect(unlockedFinite().buildingSupply).toEqual({ houses: 32, hotels: 12 });
    expect(freshGame().buildingSupply).toBeNull();
  });

  it("building a house draws one from the bank, keeping the pool conserved", () => {
    const result = applyAction(unlockedFinite(), {
      type: "BuildHouse",
      playerId: "p1",
      position: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.buildingSupply).toEqual({ houses: 31, hotels: 12 });
    expect(result.state.buildingSupply!.houses + totalHouses(result.state)).toBe(32);
  });

  it("building a hotel returns its 4 houses to the bank and consumes a hotel", () => {
    let state = unlockedFinite();
    for (let i = 0; i < 4; i++) {
      const r = applyAction(state, { type: "BuildHouse", playerId: "p1", position: 1 });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      state = r.state;
    }
    expect(state.buildingSupply).toEqual({ houses: 28, hotels: 12 });

    const hotel = applyAction(state, { type: "BuildHouse", playerId: "p1", position: 1 });
    expect(hotel.ok).toBe(true);
    if (!hotel.ok) return;
    expect(hotel.state.properties[1]?.hasHotel).toBe(true);
    expect(hotel.state.buildingSupply).toEqual({ houses: 32, hotels: 11 });
    // Both pool invariants hold after the conversion.
    expect(hotel.state.buildingSupply!.houses + totalHouses(hotel.state)).toBe(32);
    expect(hotel.state.buildingSupply!.hotels + totalHotels(hotel.state)).toBe(12);
  });

  it("an empty house pool blocks building until someone sells", () => {
    const state = { ...unlockedFinite(), buildingSupply: { houses: 0, hotels: 12 } };
    const blocked = applyAction(state, { type: "BuildHouse", playerId: "p1", position: 1 });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.reason).toMatch(/no houses left/i);
    // The AI/UI gate agrees, so the AI never proposes an impossible build.
    expect(canBuildOnProperty(state, "p1", 1)).toBe(false);
  });

  it("selling a building returns it to the bank's stock", () => {
    const built = applyAction(unlockedFinite(), {
      type: "BuildHouse",
      playerId: "p1",
      position: 1,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.state.buildingSupply).toEqual({ houses: 31, hotels: 12 });
    const sold = applyAction(built.state, { type: "SellHouse", playerId: "p1", position: 1 });
    expect(sold.ok).toBe(true);
    if (!sold.ok) return;
    expect(sold.state.buildingSupply).toEqual({ houses: 32, hotels: 12 });
  });

  it("razing buildings on a bank bankruptcy returns them to the pool", () => {
    let state = unlockedFinite();
    state = {
      ...state,
      properties: {
        ...state.properties,
        1: { ownerId: "p1", houses: 0, hasHotel: true, isMortgaged: false },
        16: { ownerId: "p1", houses: 3, hasHotel: false, isMortgaged: false },
      },
      // Pool reflects those placements: 3 houses and 1 hotel are out.
      buildingSupply: { houses: 29, hotels: 11 },
      turnPhase: "turn-idle",
    };
    const result = applyAction(state, { type: "DeclareBankruptcy", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.buildingSupply).toEqual({ houses: 32, hotels: 12 });
  });
});

describe("event cards report their cash movement", () => {
  it("attaches a positive cashDelta when a card pays out from the bank", () => {
    // Chance sits at position 7; from GO (0) a roll summing to 7 lands there
    // off that exact sum, and CHANCE_TABLE[7] collects 200 from the bank.
    const result = rollForSum(placeAt(freshGame(), "p1", 0), "p1", 7);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const card = result.events.find((e) => e.type === "EventCardResolved");
    expect(card?.type).toBe("EventCardResolved");
    if (card?.type !== "EventCardResolved") return;
    expect(card.cashDelta).toBe(200);
  });

  it("attaches a negative cashDelta when a card charges the player", () => {
    // From position 5, a roll summing to 2 lands on the same Chance tile;
    // CHANCE_TABLE[2] charges 50 to the bank.
    const result = rollForSum(placeAt(freshGame(), "p1", 5), "p1", 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const card = result.events.find((e) => e.type === "EventCardResolved");
    expect(card?.type).toBe("EventCardResolved");
    if (card?.type !== "EventCardResolved") return;
    expect(card.cashDelta).toBe(-50);
  });
});

describe("sell property to auction", () => {
  // p1 owns Nizamabad (position 1, price 100, mortgage value 50), and it's p1's
  // turn to manage their board (turn-idle).
  function sellableGame(
    playerIds: readonly string[],
    opts: {
      houses?: number;
      hasHotel?: boolean;
      isMortgaged?: boolean;
      turnPhase?: GameState["turnPhase"];
    } = {},
  ): GameState {
    const base = freshGame(playerIds);
    return {
      ...base,
      turnPhase: opts.turnPhase ?? "turn-idle",
      properties: {
        ...base.properties,
        1: {
          ownerId: "p1",
          houses: opts.houses ?? 0,
          hasHotel: opts.hasHotel ?? false,
          isMortgaged: opts.isMortgaged ?? false,
        },
      },
    };
  }

  it("auctions the property with the seller excluded and a mortgage-value reserve", () => {
    const state = sellableGame(["p1", "p2", "p3"]);
    const result = applyAction(state, { type: "SellProperty", playerId: "p1", position: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const auction = result.state.pendingAuction;
    expect(result.state.turnPhase).toBe("awaiting-auction");
    expect(auction?.sellerId).toBe("p1");
    expect(auction?.minBid).toBe(50); // Nizamabad's mortgage value
    expect(auction?.activeBidderIds).not.toContain("p1");
    expect([...(auction?.activeBidderIds ?? [])].sort()).toEqual(["p2", "p3"]);
  });

  it("a sole bidder (2-player) wins at their bid and pays the seller", () => {
    const state = sellableGame(["p1", "p2"]);
    const p1Cash = state.players[0]!.cash;
    const p2Cash = state.players[1]!.cash;

    const sold = applyAction(state, { type: "SellProperty", playerId: "p1", position: 1 });
    expect(sold.ok).toBe(true);
    if (!sold.ok) return;

    const won = applyAction(sold.state, { type: "PlaceBid", playerId: "p2", amount: 50 });
    expect(won.ok).toBe(true);
    if (!won.ok) return;

    expect(won.state.pendingAuction).toBeNull();
    expect(won.state.turnPhase).toBe("turn-idle");
    expect(won.state.properties[1]?.ownerId).toBe("p2");
    expect(won.state.players.find((p) => p.id === "p1")!.cash).toBe(p1Cash + 50);
    expect(won.state.players.find((p) => p.id === "p2")!.cash).toBe(p2Cash - 50);
    // Player-to-player transfer conserves money in the system.
    expect(totalMoneyInSystem(won.state)).toBe(totalMoneyInSystem(state));
  });

  it("keeps the property with the seller when nobody bids", () => {
    const state = sellableGame(["p1", "p2"]);
    const p1Cash = state.players[0]!.cash;

    const sold = applyAction(state, { type: "SellProperty", playerId: "p1", position: 1 });
    if (!sold.ok) return;
    const passed = applyAction(sold.state, { type: "PassAuction", playerId: "p2" });
    expect(passed.ok).toBe(true);
    if (!passed.ok) return;

    expect(passed.state.pendingAuction).toBeNull();
    expect(passed.state.turnPhase).toBe("turn-idle");
    expect(passed.state.properties[1]?.ownerId).toBe("p1");
    expect(passed.state.players.find((p) => p.id === "p1")!.cash).toBe(p1Cash);
    const voided = passed.events.find((e) => e.type === "AuctionVoided");
    expect(voided?.type).toBe("AuctionVoided");
  });

  it("rejects a bid below the reserve", () => {
    const state = sellableGame(["p1", "p2", "p3"]);
    const sold = applyAction(state, { type: "SellProperty", playerId: "p1", position: 1 });
    if (!sold.ok) return;
    const bidder = sold.state.pendingAuction!.turnBidderId;
    const low = applyAction(sold.state, { type: "PlaceBid", playerId: bidder, amount: 40 });
    expect(low.ok).toBe(false);
  });

  it("a competitive sale (3-player) resolves to the last standing bidder", () => {
    const state = sellableGame(["p1", "p2", "p3"]);
    const sold = applyAction(state, { type: "SellProperty", playerId: "p1", position: 1 });
    if (!sold.ok) return;
    const first = sold.state.pendingAuction!.turnBidderId;
    const bid = applyAction(sold.state, { type: "PlaceBid", playerId: first, amount: 60 });
    expect(bid.ok).toBe(true);
    if (!bid.ok) return;
    const next = bid.state.pendingAuction!.turnBidderId;
    const resolved = applyAction(bid.state, { type: "PassAuction", playerId: next });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.state.pendingAuction).toBeNull();
    expect(resolved.state.properties[1]?.ownerId).toBe(first);
    expect(resolved.state.players.find((p) => p.id === "p1")!.cash).toBe(
      state.players[0]!.cash + 60,
    );
  });

  it("can't sell a property with buildings or one that's mortgaged", () => {
    const built = sellableGame(["p1", "p2"], { houses: 2 });
    expect(applyAction(built, { type: "SellProperty", playerId: "p1", position: 1 }).ok).toBe(
      false,
    );
    const mortgaged = sellableGame(["p1", "p2"], { isMortgaged: true });
    expect(applyAction(mortgaged, { type: "SellProperty", playerId: "p1", position: 1 }).ok).toBe(
      false,
    );
  });

  it("returns the seller to resolving-debt after a sale mid-debt", () => {
    const state: GameState = {
      ...sellableGame(["p1", "p2"], { turnPhase: "resolving-debt" }),
      pendingDebt: { debtorId: "p1", amount: 300, creditorId: null, reason: "tax" },
    };
    const sold = applyAction(state, { type: "SellProperty", playerId: "p1", position: 1 });
    if (!sold.ok) return;
    const won = applyAction(sold.state, { type: "PlaceBid", playerId: "p2", amount: 50 });
    expect(won.ok).toBe(true);
    if (!won.ok) return;
    expect(won.state.turnPhase).toBe("resolving-debt");
    expect(won.state.pendingDebt?.debtorId).toBe("p1");
  });

  it("can't sell on another player's turn", () => {
    const state = sellableGame(["p1", "p2"]);
    // It's p1's turn (currentPlayerIndex 0); p2 attempting a sale is rejected.
    const owned = {
      ...state,
      properties: {
        ...state.properties,
        3: { ownerId: "p2", houses: 0, hasHotel: false, isMortgaged: false },
      },
    };
    expect(applyAction(owned, { type: "SellProperty", playerId: "p2", position: 3 }).ok).toBe(
      false,
    );
  });
});

describe("monopoly doubles base rent", () => {
  function ownAll(base: GameState, positions: readonly number[], ownerId: string): GameState {
    const properties = { ...base.properties };
    for (const pos of positions) {
      properties[pos] = { ownerId, houses: 0, hasHotel: false, isMortgaged: false };
    }
    return { ...base, properties };
  }

  it("doubles base rent when a full colour set is owned — including two-property groups", () => {
    for (const group of ["brown", "dark-blue", "pink"] as const) {
      const tiles = BOARD.filter((t) => t.type === "property" && t.group === group);
      const first = tiles[0];
      if (!first || first.type !== "property") throw new Error(`no ${group} tiles`);
      const base = freshGame(["p1", "p2"]);

      // Owning only one of the group: plain base rent.
      const partial = ownAll(base, [first.position], "p1");
      expect(calculateRent(partial, first.position, 7)).toBe(first.rent.base);

      // Owning the whole group: base rent doubled on the unimproved tile.
      const full = ownAll(
        base,
        tiles.map((t) => t.position),
        "p1",
      );
      expect(calculateRent(full, first.position, 7)).toBe(first.rent.base * 2);
    }
  });

  it("does not double once a house is built (house-tier rent takes over)", () => {
    const brown = BOARD.filter((t) => t.type === "property" && t.group === "brown");
    const first = brown[0];
    if (!first || first.type !== "property") throw new Error("no brown tiles");
    const base = freshGame(["p1", "p2"]);
    const full = ownAll(
      base,
      brown.map((t) => t.position),
      "p1",
    );
    // Add one house to the inspected tile.
    const withHouse: GameState = {
      ...full,
      properties: {
        ...full.properties,
        [first.position]: { ownerId: "p1", houses: 1, hasHotel: false, isMortgaged: false },
      },
    };
    expect(calculateRent(withHouse, first.position, 7)).toBe(first.rent.oneHouse);
  });
});
