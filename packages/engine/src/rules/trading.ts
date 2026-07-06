import type { GameEvent, GameState, TradeAssets, TradeOffer } from "../core/types.js";
import { ownerOf } from "./property.js";

function canDeliver(state: GameState, playerId: string, assets: TradeAssets): string | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return `Unknown player ${playerId}`;
  if (player.cash < assets.cash) return `${playerId} cannot cover ${assets.cash} cash`;
  if (player.jailFreeCards < (assets.jailFreeCards ?? 0)) {
    return `${playerId} does not have ${assets.jailFreeCards} jail-free cards`;
  }
  for (const position of assets.propertyPositions) {
    if (ownerOf(state, position) !== playerId) {
      return `${playerId} does not own position ${position}`;
    }
    if (state.properties[position]?.houses || state.properties[position]?.hasHotel) {
      return `Position ${position} has buildings — sell them before trading`;
    }
  }
  return null;
}

export function proposeTrade(
  state: GameState,
  proposerId: string,
  recipientId: string,
  proposerGives: TradeAssets,
  recipientGives: TradeAssets,
): { state: GameState; events: readonly GameEvent[] } | { error: string } {
  if (proposerId === recipientId) return { error: "Cannot trade with yourself" };
  if (state.pendingTrade) return { error: "Another trade is already pending" };

  const proposerError = canDeliver(state, proposerId, proposerGives);
  if (proposerError) return { error: proposerError };
  const recipientError = canDeliver(state, recipientId, recipientGives);
  if (recipientError) return { error: recipientError };

  // Deterministic id (not a random UUID) so replaying this action on resume
  // reproduces the same id, keeping the follow-up Accept/Reject valid.
  const tradeSeq = state.tradeSeq + 1;
  const trade: TradeOffer = {
    id: `trade-${tradeSeq}`,
    proposerId,
    recipientId,
    proposerGives,
    recipientGives,
  };

  return {
    state: { ...state, pendingTrade: trade, tradeSeq },
    events: [{ type: "TradeProposed", trade }],
  };
}

export function acceptTrade(
  state: GameState,
  playerId: string,
  tradeId: string,
): { state: GameState; events: readonly GameEvent[] } | { error: string } {
  const trade = state.pendingTrade;
  if (!trade || trade.id !== tradeId) return { error: "No such pending trade" };
  if (trade.recipientId !== playerId) return { error: "Only the recipient can accept a trade" };

  const proposerError = canDeliver(state, trade.proposerId, trade.proposerGives);
  if (proposerError) return { error: `Trade no longer valid: ${proposerError}` };
  const recipientError = canDeliver(state, trade.recipientId, trade.recipientGives);
  if (recipientError) return { error: `Trade no longer valid: ${recipientError}` };

  const proposerGivesCards = trade.proposerGives.jailFreeCards ?? 0;
  const recipientGivesCards = trade.recipientGives.jailFreeCards ?? 0;

  let next = state;
  next = {
    ...next,
    players: next.players.map((p) => {
      if (p.id === trade.proposerId) {
        return {
          ...p,
          cash: p.cash - trade.proposerGives.cash + trade.recipientGives.cash,
          jailFreeCards: p.jailFreeCards - proposerGivesCards + recipientGivesCards,
        };
      }
      if (p.id === trade.recipientId) {
        return {
          ...p,
          cash: p.cash - trade.recipientGives.cash + trade.proposerGives.cash,
          jailFreeCards: p.jailFreeCards - recipientGivesCards + proposerGivesCards,
        };
      }
      return p;
    }),
  };

  const properties = { ...next.properties };
  for (const position of trade.proposerGives.propertyPositions) {
    const ownership = properties[position];
    if (ownership) properties[position] = { ...ownership, ownerId: trade.recipientId };
  }
  for (const position of trade.recipientGives.propertyPositions) {
    const ownership = properties[position];
    if (ownership) properties[position] = { ...ownership, ownerId: trade.proposerId };
  }
  next = { ...next, properties, pendingTrade: null };

  return { state: next, events: [{ type: "TradeExecuted", trade }] };
}

export function rejectTrade(
  state: GameState,
  playerId: string,
  tradeId: string,
): { state: GameState; events: readonly GameEvent[] } | { error: string } {
  const trade = state.pendingTrade;
  if (!trade || trade.id !== tradeId) return { error: "No such pending trade" };
  if (playerId !== trade.proposerId && playerId !== trade.recipientId) {
    return { error: "Only a party to the trade can reject it" };
  }
  return {
    state: { ...state, pendingTrade: null },
    events: [{ type: "TradeRejected", tradeId }],
  };
}
