import type { GameState, PropertyOwnership } from "../core/types.js";
import {
  BOARD,
  getTile,
  isOwnable,
  propertiesInGroup,
  type PropertyGroup,
  type Tile,
} from "../economy/index.js";

export function ownershipAt(state: GameState, position: number): PropertyOwnership | undefined {
  return state.properties[position];
}

export function ownerOf(state: GameState, position: number): string | null {
  return ownershipAt(state, position)?.ownerId ?? null;
}

function setOwnership(state: GameState, position: number, ownership: PropertyOwnership): GameState {
  return { ...state, properties: { ...state.properties, [position]: ownership } };
}

export function initialOwnership(): PropertyOwnership {
  return { ownerId: null, houses: 0, hasHotel: false, isMortgaged: false };
}

const BUILDING_UNLOCK_PROPERTY_COUNT = 17;

/** Positions of every ownable tile a given player currently owns. */
export function propertiesOwnedBy(state: GameState, playerId: string): readonly number[] {
  return BOARD.filter(isOwnable)
    .map((t) => t.position)
    .filter((pos) => ownerOf(state, pos) === playerId);
}

function countOwnedInGroup(state: GameState, playerId: string, group: PropertyGroup): number {
  return propertiesInGroup(group).filter((p) => ownerOf(state, p.position) === playerId).length;
}

/**
 * Whether a player owns EVERY property in a colour group (a monopoly), which
 * doubles the base rent on the group's unimproved tiles. Compares against the
 * group's actual size, so it works for the two-property groups (brown,
 * dark-blue) too — not just the three-property ones.
 */
export function hasMonopoly(state: GameState, playerId: string, group: PropertyGroup): boolean {
  const inGroup = propertiesInGroup(group);
  return inGroup.length > 0 && countOwnedInGroup(state, playerId, group) === inGroup.length;
}

function countOwnedOfType(state: GameState, playerId: string, type: "transit" | "utility"): number {
  return BOARD.filter((t) => t.type === type).filter((t) => ownerOf(state, t.position) === playerId)
    .length;
}

/**
 * The core rent formula. `diceSum` is required for utility rent and
 * ignored otherwise — callers always have it available.
 */
export function calculateRent(state: GameState, position: number, diceSum: number): number {
  const tile = getTile(position);
  const ownership = ownershipAt(state, position);
  if (!ownership || !ownership.ownerId || ownership.isMortgaged) return 0;

  if (tile.type === "property") {
    if (ownership.hasHotel) return tile.rent.hotel;
    if (ownership.houses > 0) {
      const tiers = [
        tile.rent.oneHouse,
        tile.rent.twoHouses,
        tile.rent.threeHouses,
        tile.rent.fourHouses,
      ];
      return tiers[ownership.houses - 1] ?? tile.rent.base;
    }
    const monopoly = hasMonopoly(state, ownership.ownerId, tile.group);
    return monopoly ? tile.rent.base * 2 : tile.rent.base;
  }

  if (tile.type === "transit") {
    const owned = countOwnedOfType(state, ownership.ownerId, "transit");
    return tile.rentBySetSize[Math.min(owned, 4) - 1] ?? 0;
  }

  if (tile.type === "utility") {
    const owned = countOwnedOfType(state, ownership.ownerId, "utility");
    const multiplier = tile.diceMultiplierBySetSize[Math.min(owned, 2) - 1] ?? 0;
    return diceSum * multiplier;
  }

  return 0;
}

export function priceOf(tile: Tile): number {
  if (tile.type === "property" || tile.type === "transit" || tile.type === "utility") {
    return tile.price;
  }
  return 0;
}

export function purchaseProperty(state: GameState, playerId: string, position: number): GameState {
  return setOwnership(state, position, {
    ownerId: playerId,
    houses: 0,
    hasHotel: false,
    isMortgaged: false,
  });
}

export function mortgageProperty(state: GameState, position: number): GameState {
  const ownership = ownershipAt(state, position);
  if (!ownership) throw new Error(`mortgageProperty: ${position} has no ownership record`);
  return setOwnership(state, position, { ...ownership, isMortgaged: true });
}

export function unmortgageProperty(state: GameState, position: number): GameState {
  const ownership = ownershipAt(state, position);
  if (!ownership) throw new Error(`unmortgageProperty: ${position} has no ownership record`);
  return setOwnership(state, position, { ...ownership, isMortgaged: false });
}

export function buildingUnlockReached(state: GameState): boolean {
  return (
    BOARD.filter((tile) => tile.type === "property").filter(
      (tile) => ownerOf(state, tile.position) !== null,
    ).length >= BUILDING_UNLOCK_PROPERTY_COUNT
  );
}

export function canBuildOnProperty(state: GameState, playerId: string, position: number): boolean {
  const tile = getTile(position);
  if (tile.type !== "property") return false;

  const ownership = ownershipAt(state, position);
  if (!ownership || ownership.ownerId !== playerId || ownership.hasHotel) return false;
  if (!buildingUnlockReached(state)) return false;
  if (!canBuildEvenly(state, playerId, position)) return false;

  // Finite-supply house rule: the required building must be in the bank's
  // stock. The 5th build (4 houses -> hotel) needs a hotel; otherwise a house.
  const supply = state.buildingSupply;
  if (supply) {
    const buildingHotel = ownership.houses === 4;
    if (buildingHotel ? supply.hotels < 1 : supply.houses < 1) return false;
  }

  const groupHasMortgaged = propertiesInGroup(tile.group).some(
    (p) => ownershipAt(state, p.position)?.isMortgaged,
  );
  return !groupHasMortgaged;
}

/** A property's development level for the even-building rule: houses, or 5 for
 *  a hotel (the 5th build). */
function developmentLevel(ownership: PropertyOwnership | undefined): number {
  if (!ownership) return 0;
  return ownership.hasHotel ? 5 : ownership.houses;
}

/**
 * Even-building house rule: you may only build on the *least*-developed
 * property you own in its colour group (so a group climbs one level at a time),
 * and only sell from the *most*-developed one. Adapted to AadesiPo's model,
 * where you can own part of a group — "even" is measured across just the tiles
 * you own in that group. Always true when the rule is off.
 */
export function canBuildEvenly(state: GameState, playerId: string, position: number): boolean {
  if (!state.houseRules.evenBuilding) return true;
  const tile = getTile(position);
  if (tile.type !== "property") return true;
  const mine = propertiesInGroup(tile.group)
    .filter((p) => ownerOf(state, p.position) === playerId)
    .map((p) => developmentLevel(ownershipAt(state, p.position)));
  if (mine.length === 0) return true;
  return developmentLevel(ownershipAt(state, position)) === Math.min(...mine);
}

export function canSellEvenly(state: GameState, playerId: string, position: number): boolean {
  if (!state.houseRules.evenBuilding) return true;
  const tile = getTile(position);
  if (tile.type !== "property") return true;
  const mine = propertiesInGroup(tile.group)
    .filter((p) => ownerOf(state, p.position) === playerId)
    .map((p) => developmentLevel(ownershipAt(state, p.position)));
  if (mine.length === 0) return true;
  return developmentLevel(ownershipAt(state, position)) === Math.max(...mine);
}

/**
 * Adds one house, or converts 4 houses -> a hotel. The reducer is responsible
 * for checking the global build unlock, affordability, finite supply, and (when
 * the house rule is on) even-building — see canBuildOnProperty / canBuildEvenly.
 */
export function addBuilding(state: GameState, position: number): GameState {
  const ownership = ownershipAt(state, position);
  if (!ownership) throw new Error(`addBuilding: ${position} has no ownership record`);
  if (ownership.hasHotel) throw new Error(`addBuilding: ${position} already has a hotel`);

  if (ownership.houses === 4) {
    return setOwnership(state, position, { ...ownership, houses: 0, hasHotel: true });
  }
  return setOwnership(state, position, { ...ownership, houses: ownership.houses + 1 });
}

/** Directly sets a property's building state. Low-level; used by the reducer
 *  for supply-constrained hotel sales, where a housing shortage can leave the
 *  property with fewer than 4 reconstituted houses. */
export function setBuildingState(
  state: GameState,
  position: number,
  houses: number,
  hasHotel: boolean,
): GameState {
  const ownership = ownershipAt(state, position);
  if (!ownership) throw new Error(`setBuildingState: ${position} has no ownership record`);
  return setOwnership(state, position, { ...ownership, houses, hasHotel });
}

export function removeBuilding(state: GameState, position: number): GameState {
  const ownership = ownershipAt(state, position);
  if (!ownership) throw new Error(`removeBuilding: ${position} has no ownership record`);

  if (ownership.hasHotel) {
    return setOwnership(state, position, { ...ownership, hasHotel: false, houses: 4 });
  }
  if (ownership.houses === 0) {
    throw new Error(`removeBuilding: ${position} has no buildings to sell`);
  }
  return setOwnership(state, position, { ...ownership, houses: ownership.houses - 1 });
}

/**
 * Cash + property value (mortgaged counted at mortgage value) + half
 * the building cost invested, minus any outstanding bank loan. Used for
 * net-worth win checks — so an unpaid loan drags a player's ranking down.
 */
export function netWorth(state: GameState, playerId: string): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 0;

  let worth = player.cash - (player.loan?.owed ?? 0);
  for (const position of propertiesOwnedBy(state, playerId)) {
    const tile = getTile(position);
    const ownership = ownershipAt(state, position);
    if (!ownership || !isOwnable(tile)) continue;

    worth += ownership.isMortgaged ? tile.mortgageValue : tile.price;

    if (tile.type === "property") {
      const investedHouses = ownership.hasHotel ? 4 : ownership.houses;
      const buildingSpend =
        investedHouses * tile.buildingCost + (ownership.hasHotel ? tile.buildingCost : 0);
      worth += Math.round(buildingSpend / 2);
    }
  }
  return worth;
}
