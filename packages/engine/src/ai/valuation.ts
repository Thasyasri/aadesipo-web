import type { GameState } from "../core/types.js";
import { getTile, isOwnable, propertiesInGroup } from "../economy/index.js";
import { buildingUnlockReached, ownerOf, priceOf } from "../rules/property.js";
import type { PersonalityParams } from "./personalities.js";

const AVERAGE_TWO_DICE_ROLL = 7;

/**
 * A rough rent-to-price yield for a tile, used as the baseline signal
 * before monopoly/blocking/liquidity adjustments. Same shape across
 * property/transit/utility so the rest of the model doesn't need to
 * branch on tile type.
 */
function baseYield(position: number): number {
  const tile = getTile(position);
  if (!isOwnable(tile)) return 0;
  const price = priceOf(tile);
  if (price === 0) return 0;

  if (tile.type === "property") return tile.rent.base / price;
  if (tile.type === "transit") return tile.rentBySetSize[0] / price;
  return (AVERAGE_TWO_DICE_ROLL * tile.diceMultiplierBySetSize[0]) / price;
}

function groupProgress(state: GameState, playerId: string, position: number): number {
  const tile = getTile(position);
  if (tile.type !== "property") return 0;
  return propertiesInGroup(tile.group).filter((p) => ownerOf(state, p.position) === playerId)
    .length;
}

function completesMonopoly(state: GameState, playerId: string, position: number): boolean {
  const tile = getTile(position);
  if (tile.type !== "property") return false;
  const group = propertiesInGroup(tile.group);
  return group.every((p) => p.position === position || ownerOf(state, p.position) === playerId);
}

function blocksAnOpponent(state: GameState, playerId: string, position: number): string | null {
  const tile = getTile(position);
  if (tile.type !== "property") return null;
  const group = propertiesInGroup(tile.group);
  const owners = new Set(
    group
      .filter((p) => p.position !== position)
      .map((p) => ownerOf(state, p.position))
      .filter((id): id is string => id !== null && id !== playerId),
  );
  return owners.size === 1 ? [...owners][0]! : null;
}

/**
 * The core valuation: how much is this tile worth to this player, right
 * now, given their personality? Higher is more attractive. Not a price
 * in rupees — a comparable score used to rank options against each
 * other and against a buy/pass threshold.
 */
export function propertyValue(
  state: GameState,
  playerId: string,
  position: number,
  personality: PersonalityParams,
): number {
  const tile = getTile(position);
  if (!isOwnable(tile)) return 0;

  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 0;

  const price = priceOf(tile);
  let score = baseYield(position) * 1000;

  if (buildingUnlockReached(state) && ownerOf(state, position) === playerId) {
    score += 400; // the new board-wide unlock makes building potential attractive
  } else if (completesMonopoly(state, playerId, position)) {
    score += 400; // rent doubling + building potential — the biggest swing available
  } else {
    score += groupProgress(state, playerId, position) * 60;
  }

  const blockedOpponent = blocksAnOpponent(state, playerId, position);
  if (blockedOpponent) {
    score += 150 * personality.spite;
  }

  const cashAfterPurchase = player.cash - price;
  if (cashAfterPurchase < personality.cashReserveTarget) {
    const shortfall = personality.cashReserveTarget - cashAfterPurchase;
    score -= shortfall * (1 - personality.riskAppetite) * 0.5;
  }

  return score;
}

/**
 * The maximum a personality is willing to pay for a tile at auction —
 * their valuation stretched by aggression, and further by spite if it
 * denies an opponent, but never past what leaves them dangerously short
 * of their reserve target.
 */
export function maxAuctionBid(
  state: GameState,
  playerId: string,
  position: number,
  personality: PersonalityParams,
): number {
  const tile = getTile(position);
  if (!isOwnable(tile)) return 0;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 0;

  const value = propertyValue(state, playerId, position, personality);
  const basePrice = priceOf(tile);
  const willingness =
    basePrice * (0.5 + Math.max(0, value) / 400) * (0.6 + personality.aggression * 0.6);

  const affordableCeiling = Math.max(
    0,
    player.cash - personality.cashReserveTarget * (1 - personality.riskAppetite),
  );
  return Math.min(Math.round(willingness), Math.floor(affordableCeiling));
}
