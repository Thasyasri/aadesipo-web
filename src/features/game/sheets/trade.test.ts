import { describe, expect, it } from "vitest";
import {
  applyAction,
  createInitialState,
  CLASSIC_MODE,
  decideTradeResponse,
  getTile,
  PERSONALITIES,
  priceOf,
  type AiConfig,
  type GameEvent,
  type GameState,
  type PropertyOwnership,
  type TradeAssets,
  type TradeOffer,
} from "@aadesipo/engine";
import { assetsValue, tradeBreakdown } from "./tradeValue";
import { buildTradeHistory } from "./tradeHistory";

const price = (position: number): number => priceOf(getTile(position));
const AI: AiConfig = { personality: PERSONALITIES.gambler, skillLevel: 1 };

function offer(over: Partial<TradeOffer>): TradeOffer {
  return {
    id: "t",
    proposerId: "p1",
    recipientId: "p2",
    proposerGives: { cash: 0, propertyPositions: [] },
    recipientGives: { cash: 0, propertyPositions: [] },
    ...over,
  };
}

function own(ownerId: string): PropertyOwnership {
  return { ownerId, houses: 0, hasHotel: false, isMortgaged: false };
}

/** A game where p1 owns positions 1 & 3, p2 owns 6 & 8, with set cash. */
function tradeGame(p1Cash = 1000, p2Cash = 1000): GameState {
  const base = createInitialState("trade-seed", CLASSIC_MODE, ["p1", "p2"]);
  return {
    ...base,
    players: base.players.map((p) =>
      p.id === "p1" ? { ...p, cash: p1Cash } : { ...p, cash: p2Cash },
    ),
    properties: { 1: own("p1"), 3: own("p1"), 6: own("p2"), 8: own("p2") },
    turnPhase: "turn-idle",
  };
}

describe("trade value breakdown", () => {
  it("sums cash plus each property's real list price", () => {
    const assets: TradeAssets = { cash: 250, propertyPositions: [1, 3] };
    const expected = 250 + price(1) + price(3);
    expect(assetsValue(assets)).toBe(expected);
  });

  it("computes give / get / net from the perspective player's point of view", () => {
    const give: TradeAssets = { cash: 100, propertyPositions: [1] }; // 100 + price(1)
    const get: TradeAssets = { cash: 0, propertyPositions: [6, 8] }; // price(6) + price(8)
    const b = tradeBreakdown(give, get);
    expect(b.give).toBe(100 + price(1));
    expect(b.get).toBe(price(6) + price(8));
    expect(b.net).toBe(b.get - b.give);
  });
});

describe("trade actions via the reducer (the path the UI dispatches through)", () => {
  it("proposes a trade with a mix of cash and properties on both sides", () => {
    const state = tradeGame();
    const result = applyAction(state, {
      type: "ProposeTrade",
      proposerId: "p1",
      recipientId: "p2",
      proposerGives: { cash: 150, propertyPositions: [1] },
      recipientGives: { cash: 50, propertyPositions: [6, 8] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const trade = result.state.pendingTrade;
    expect(trade).not.toBeNull();
    expect(trade!.proposerId).toBe("p1");
    expect(trade!.recipientId).toBe("p2");
    expect(trade!.proposerGives).toEqual({ cash: 150, propertyPositions: [1] });
    expect(trade!.recipientGives).toEqual({ cash: 50, propertyPositions: [6, 8] });
  });

  it("accepting a valid trade transfers the agreed cash and properties", () => {
    const proposed = applyAction(tradeGame(1000, 1000), {
      type: "ProposeTrade",
      proposerId: "p1",
      recipientId: "p2",
      proposerGives: { cash: 150, propertyPositions: [1] },
      recipientGives: { cash: 50, propertyPositions: [6, 8] },
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    const tradeId = proposed.state.pendingTrade!.id;

    const accepted = applyAction(proposed.state, {
      type: "AcceptTrade",
      playerId: "p2",
      tradeId,
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    const s = accepted.state;

    // Property ownership swapped as agreed.
    expect(s.properties[1]?.ownerId).toBe("p2");
    expect(s.properties[6]?.ownerId).toBe("p1");
    expect(s.properties[8]?.ownerId).toBe("p1");
    // p1: -150 cash out, +50 cash in => net -100.
    expect(s.players.find((p) => p.id === "p1")!.cash).toBe(1000 - 150 + 50);
    // p2: -50 cash out, +150 cash in => net +100.
    expect(s.players.find((p) => p.id === "p2")!.cash).toBe(1000 - 50 + 150);
    // Pending trade cleared.
    expect(s.pendingTrade).toBeNull();
  });

  it("rejecting a trade clears the pending state without transferring anything", () => {
    const proposed = applyAction(tradeGame(), {
      type: "ProposeTrade",
      proposerId: "p1",
      recipientId: "p2",
      proposerGives: { cash: 0, propertyPositions: [1] },
      recipientGives: { cash: 0, propertyPositions: [6] },
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    const tradeId = proposed.state.pendingTrade!.id;

    const rejected = applyAction(proposed.state, {
      type: "RejectTrade",
      playerId: "p2",
      tradeId,
    });
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(rejected.state.pendingTrade).toBeNull();
    // Ownership unchanged.
    expect(rejected.state.properties[1]?.ownerId).toBe("p1");
    expect(rejected.state.properties[6]?.ownerId).toBe("p2");
  });

  it("blocks proposing a second trade while one is already pending", () => {
    const proposed = applyAction(tradeGame(), {
      type: "ProposeTrade",
      proposerId: "p1",
      recipientId: "p2",
      proposerGives: { cash: 100, propertyPositions: [] },
      recipientGives: { cash: 0, propertyPositions: [6] },
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const second = applyAction(proposed.state, {
      type: "ProposeTrade",
      proposerId: "p1",
      recipientId: "p2",
      proposerGives: { cash: 0, propertyPositions: [3] },
      recipientGives: { cash: 0, propertyPositions: [8] },
    });
    expect(second.ok).toBe(false);
    // Original trade is untouched.
    expect(proposed.state.pendingTrade).not.toBeNull();
  });
});

describe("AI trade response (decoupled from turn order)", () => {
  it("accepts a clearly favorable offer and rejects a clearly unfavorable one", () => {
    const base = tradeGame(); // p2 owns 6 & 8

    // Favorable to the AI (p2): it receives a big pile of cash for a tile.
    const favorable: GameState = {
      ...base,
      pendingTrade: offer({
        proposerGives: { cash: 100000, propertyPositions: [] },
        recipientGives: { cash: 0, propertyPositions: [6] },
      }),
    };
    expect(decideTradeResponse(favorable, "p2", AI)).toEqual({
      type: "AcceptTrade",
      playerId: "p2",
      tradeId: "t",
    });

    // Unfavorable: the AI gives a tile away for nothing.
    const unfavorable: GameState = {
      ...base,
      pendingTrade: offer({
        proposerGives: { cash: 0, propertyPositions: [] },
        recipientGives: { cash: 0, propertyPositions: [6] },
      }),
    };
    expect(decideTradeResponse(unfavorable, "p2", AI)).toEqual({
      type: "RejectTrade",
      playerId: "p2",
      tradeId: "t",
    });
  });

  it("returns null for a player who is not the pending trade's recipient", () => {
    const state: GameState = { ...tradeGame(), pendingTrade: offer({}) };
    expect(decideTradeResponse(state, "p1", AI)).toBeNull(); // p1 is the proposer
    expect(decideTradeResponse(tradeGame(), "p2", AI)).toBeNull(); // no pending trade
  });
});

describe("trade history reconstruction from the event log", () => {
  it("groups trades into ongoing / accepted / rejected with full asset detail", () => {
    const t1 = offer({ id: "t1", recipientGives: { cash: 0, propertyPositions: [6] } });
    const t2 = offer({ id: "t2", proposerGives: { cash: 50, propertyPositions: [3] } });
    const t3 = offer({ id: "t3" });
    const events: GameEvent[] = [
      { type: "TradeProposed", trade: t1 },
      { type: "TradeExecuted", trade: t1 }, // t1 accepted
      { type: "TradeProposed", trade: t2 },
      { type: "TradeRejected", tradeId: "t2" }, // t2 rejected
      { type: "TradeProposed", trade: t3 }, // t3 still ongoing
    ];

    const history = buildTradeHistory(events);
    expect(history.map((r) => [r.trade.id, r.status])).toEqual([
      ["t1", "accepted"],
      ["t2", "rejected"],
      ["t3", "pending"],
    ]);
    // Full asset detail is preserved from the proposal.
    expect(history[0]!.trade.recipientGives.propertyPositions).toEqual([6]);
    expect(history[1]!.trade.proposerGives).toEqual({ cash: 50, propertyPositions: [3] });
  });
});
