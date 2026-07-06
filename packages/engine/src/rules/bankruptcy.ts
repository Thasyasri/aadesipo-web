import type { GameEvent, GameState } from "../core/types.js";
import { payBetweenPlayers, payToBank, requirePlayer } from "./money.js";
import { initialOwnership, propertiesOwnedBy } from "./property.js";

/**
 * `creditorId` is who the debt was owed to: another player (rent, a
 * lost trade) or null (tax, or any other bank-owed debt). Properties
 * and remaining cash flow to whoever is owed; if it's the bank, they
 * come back unowned with buildings cleared — real Monopoly requires
 * liquidating buildings *before* bankruptcy is reached, which V1
 * doesn't enforce yet (noted, not silently skipped).
 */
export function handleBankruptcy(
  state: GameState,
  playerId: string,
  creditorId: string | null,
): { state: GameState; events: readonly GameEvent[] } {
  const player = requirePlayer(state, playerId);
  const owned = propertiesOwnedBy(state, playerId);

  let next = state;

  if (player.cash > 0) {
    next = creditorId
      ? payBetweenPlayers(next, playerId, creditorId, player.cash)
      : payToBank(next, playerId, player.cash);
  }

  const properties = { ...next.properties };
  // Buildings razed on a bank bankruptcy return to the bank's stock under the
  // finite-supply rule (properties inherited by a creditor keep theirs).
  let recoveredHouses = 0;
  let recoveredHotels = 0;
  for (const position of owned) {
    const current = properties[position];
    if (!current) continue;
    if (creditorId) {
      properties[position] = { ...current, ownerId: creditorId };
    } else {
      recoveredHouses += current.houses;
      if (current.hasHotel) recoveredHotels += 1;
      properties[position] = initialOwnership();
    }
  }
  next = { ...next, properties };

  if (!creditorId && next.buildingSupply && (recoveredHouses > 0 || recoveredHotels > 0)) {
    next = {
      ...next,
      buildingSupply: {
        houses: next.buildingSupply.houses + recoveredHouses,
        hotels: next.buildingSupply.hotels + recoveredHotels,
      },
    };
  }

  // A bankrupt player's loan is written off by the bank (their assets already
  // flow to the creditor above; the liability simply disappears with them).
  next = {
    ...next,
    players: next.players.map((p) =>
      p.id === playerId ? { ...p, isBankrupt: true, cash: 0, loan: null } : p,
    ),
  };

  return { state: next, events: [{ type: "PlayerBankrupted", playerId, creditorId }] };
}
