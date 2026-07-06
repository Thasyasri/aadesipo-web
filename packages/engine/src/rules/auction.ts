import type { AuctionState, GameEvent, GameState } from "../core/types.js";
import { payToBank } from "./money.js";
import { purchaseProperty } from "./property.js";

function nextBidderAfter(ids: readonly string[], afterId: string): string {
  const idx = ids.indexOf(afterId);
  const next = ids[(idx + 1) % ids.length];
  if (!next) throw new Error("nextBidderAfter: empty bidder list");
  return next;
}

export function startAuction(
  state: GameState,
  position: number,
  startingPlayerId: string,
): { state: GameState; events: readonly GameEvent[] } {
  const allIds = state.players.filter((p) => !p.isBankrupt).map((p) => p.id);
  const startIdx = allIds.indexOf(startingPlayerId);
  // Rotate so bidding starts with the player *after* whoever triggered
  // the auction (by declining or landing on an unowned tile), and wraps
  // back to include that player last.
  const activeBidderIds =
    startIdx === -1 ? allIds : [...allIds.slice(startIdx + 1), ...allIds.slice(0, startIdx + 1)];

  const auction: AuctionState = {
    position,
    highestBid: 0,
    highestBidderId: null,
    activeBidderIds,
    turnBidderId: activeBidderIds[0] ?? startingPlayerId,
  };

  return {
    state: { ...state, turnPhase: "awaiting-auction", pendingAuction: auction },
    events: [{ type: "AuctionStarted", position }],
  };
}

export function placeBid(
  state: GameState,
  playerId: string,
  amount: number,
): { state: GameState; events: readonly GameEvent[] } | { error: string } {
  const auction = state.pendingAuction;
  if (!auction) return { error: "No auction in progress" };
  if (auction.turnBidderId !== playerId) return { error: "Not this player's turn to bid" };
  if (amount <= auction.highestBid) return { error: "Bid must exceed the current highest bid" };

  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.cash < amount) return { error: "Cannot afford this bid" };

  const nextTurnBidder = nextBidderAfter(auction.activeBidderIds, playerId);
  const updatedAuction: AuctionState = {
    ...auction,
    highestBid: amount,
    highestBidderId: playerId,
    turnBidderId: nextTurnBidder,
  };

  return {
    state: { ...state, pendingAuction: updatedAuction },
    events: [{ type: "AuctionBid", playerId, amount }],
  };
}

export function passAuction(
  state: GameState,
  playerId: string,
): { state: GameState; events: readonly GameEvent[] } | { error: string } {
  const auction = state.pendingAuction;
  if (!auction) return { error: "No auction in progress" };
  if (auction.turnBidderId !== playerId) return { error: "Not this player's turn to bid" };

  // Compute the next bidder from the *original* rotation before removing
  // the passer — computing it after filtering breaks turn-order
  // continuity, since the passer's position in the sequence is lost.
  const nextTurnBidder = nextBidderAfter(auction.activeBidderIds, playerId);
  const remaining = auction.activeBidderIds.filter((id) => id !== playerId);
  const events: GameEvent[] = [{ type: "AuctionPassed", playerId }];

  if (remaining.length <= 1) {
    return resolveAuction(state, { ...auction, activeBidderIds: remaining }, events);
  }

  const updatedAuction: AuctionState = {
    ...auction,
    activeBidderIds: remaining,
    turnBidderId: nextTurnBidder,
  };
  return { state: { ...state, pendingAuction: updatedAuction }, events };
}

function resolveAuction(
  state: GameState,
  auction: AuctionState,
  events: GameEvent[],
): { state: GameState; events: readonly GameEvent[] } {
  const winnerId = auction.activeBidderIds[0] ?? null;

  let next: GameState = { ...state, pendingAuction: null, turnPhase: "turn-idle" };

  if (winnerId && auction.highestBid > 0) {
    next = payToBank(next, winnerId, auction.highestBid);
    next = purchaseProperty(next, winnerId, auction.position);
    events.push({
      type: "AuctionWon",
      playerId: winnerId,
      position: auction.position,
      amount: auction.highestBid,
    });
  } else {
    events.push({ type: "AuctionVoided", position: auction.position });
  }

  return { state: next, events };
}
