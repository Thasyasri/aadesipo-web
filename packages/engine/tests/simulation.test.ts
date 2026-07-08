import { describe, expect, it } from "vitest";
import { applyAction, createInitialState } from "../src/core/reducer.js";
import type { Action, GameState } from "../src/core/types.js";
import { CLASSIC_MODE, getTile } from "../src/economy/index.js";
import { priceOf } from "../src/rules/property.js";
import { totalMoneyInSystem } from "../src/rules/money.js";
import { createRngState, nextFloat, type RngState } from "../src/rng/index.js";

/**
 * A deliberately simple bot: legal-but-not-strategic. Its only job is to
 * keep a game moving without ever proposing an illegal action, so the
 * simulation can run unattended. Uses its own RNG stream (separate from
 * the game's) so "the bot's choices" and "the game's dice" don't
 * interfere with each other's determinism.
 */
/** Raise funds to cover a debt (mortgage/sell), settle when able, else fold. */
function debtAction(state: GameState, playerId: string): Action {
  const debt = state.pendingDebt!;
  const player = state.players.find((p) => p.id === playerId)!;
  if (player.cash >= debt.amount) return { type: "SettleDebt", playerId };
  const owned = Object.keys(state.properties)
    .map(Number)
    .filter((pos) => state.properties[pos]?.ownerId === playerId);
  const mortgage = owned.find((pos) => {
    const o = state.properties[pos];
    return o && !o.isMortgaged && o.houses === 0 && !o.hasHotel;
  });
  if (mortgage !== undefined) return { type: "MortgageProperty", playerId, position: mortgage };
  const sell = owned.find((pos) => {
    const o = state.properties[pos];
    return o && (o.houses > 0 || o.hasHotel);
  });
  if (sell !== undefined) return { type: "SellHouse", playerId, position: sell };
  return { type: "DeclareBankruptcy", playerId };
}

function chooseAction(state: GameState, botRng: RngState): { action: Action; nextRng: RngState } {
  const playerId = state.players[state.currentPlayerIndex]!.id;

  if (state.turnPhase === "resolving-debt") {
    return { action: debtAction(state, playerId), nextRng: botRng };
  }

  if (state.turnPhase === "awaiting-roll") {
    return { action: { type: "RollDice", playerId }, nextRng: botRng };
  }

  if (state.turnPhase === "awaiting-tile-decision") {
    const draw = nextFloat(botRng);
    const player = state.players.find((p) => p.id === playerId)!;
    const position = player.position;
    const price = priceOf(getTile(position));
    const canAffordIt = player.cash >= price;
    const wantsToBuy = canAffordIt && draw.value < 0.7;
    return {
      action: wantsToBuy
        ? { type: "BuyProperty", playerId, position }
        : { type: "DeclineProperty", playerId, position },
      nextRng: draw.nextState,
    };
  }

  if (state.turnPhase === "awaiting-auction") {
    const auction = state.pendingAuction!;
    const draw = nextFloat(botRng);
    const bidder = state.players.find((p) => p.id === auction.turnBidderId)!;
    // Respect the reserve (a declined property now opens at its list price).
    const nextBid = Math.max(auction.minBid, auction.highestBid + 10);
    const affordableMargin = bidder.cash - nextBid;
    const wantsToBid = affordableMargin > 50 && draw.value < 0.5;
    return {
      action: wantsToBid
        ? { type: "PlaceBid", playerId: auction.turnBidderId, amount: nextBid }
        : { type: "PassAuction", playerId: auction.turnBidderId },
      nextRng: draw.nextState,
    };
  }

  // turn-idle: always just end the turn. Building/trading/mortgaging are
  // covered by their own dedicated unit tests — this simulation exists
  // to stress the turn FSM end-to-end over full games.
  return { action: { type: "EndTurn", playerId }, nextRng: botRng };
}

interface SimResult {
  readonly finalState: GameState;
  readonly actionCount: number;
  readonly reachedGameOver: boolean;
}

function simulateGame(seed: string, playerCount: number, actionCap: number): SimResult {
  const playerIds = Array.from({ length: playerCount }, (_, i) => `p${i + 1}`);
  let state = createInitialState(seed, CLASSIC_MODE, playerIds);
  let botRng = createRngState(`bot-${seed}`);
  let actionCount = 0;

  while (state.turnPhase !== "game-over" && actionCount < actionCap) {
    const { action, nextRng } = chooseAction(state, botRng);
    botRng = nextRng;
    const result = applyAction(state, action);
    if (!result.ok) {
      throw new Error(
        `Bot proposed an illegal action ${JSON.stringify(action)} at step ${actionCount}: ${result.reason}`,
      );
    }

    const before = totalMoneyInSystem(state);
    const after = totalMoneyInSystem(result.state);
    if (before !== after) {
      throw new Error(
        `Money conservation violated at step ${actionCount} applying ${action.type}: ` +
          `${before} -> ${after}`,
      );
    }

    state = result.state;
    actionCount++;
  }

  return { finalState: state, actionCount, reachedGameOver: state.turnPhase === "game-over" };
}

describe("full-game simulation", () => {
  it("conserves total money across every action of many complete random games", () => {
    const seeds = Array.from({ length: 40 }, (_, i) => `sim-seed-${i}`);
    for (const seed of seeds) {
      for (const playerCount of [2, 3, 5]) {
        simulateGame(seed, playerCount, 3000);
      }
    }
  });

  it("reaches game-over within the action cap for the large majority of seeds", () => {
    const seeds = Array.from({ length: 30 }, (_, i) => `term-seed-${i}`);
    let completed = 0;
    for (const seed of seeds) {
      const result = simulateGame(seed, 3, 4000);
      if (result.reachedGameOver) completed++;
    }
    expect(completed / seeds.length).toBeGreaterThan(0.8);
  });

  it("is fully deterministic: replaying the same seed twice yields an identical final state", () => {
    const run1 = simulateGame("determinism-seed", 4, 2000);
    const run2 = simulateGame("determinism-seed", 4, 2000);
    expect(run1.finalState).toEqual(run2.finalState);
    expect(run1.actionCount).toBe(run2.actionCount);
  });

  it("every completed game has a valid winner who is not bankrupt", () => {
    const seeds = Array.from({ length: 15 }, (_, i) => `winner-check-${i}`);
    for (const seed of seeds) {
      const { finalState, reachedGameOver } = simulateGame(seed, 3, 4000);
      if (!reachedGameOver) continue;
      expect(finalState.winnerId).not.toBeNull();
      const winner = finalState.players.find((p) => p.id === finalState.winnerId);
      expect(winner).toBeDefined();
      expect(winner?.isBankrupt).toBe(false);
    }
  });
});
