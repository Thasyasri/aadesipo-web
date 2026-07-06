import type { GameEvent, GameState } from "../core/types.js";
import { payFromBank, payToBank, payBetweenPlayers } from "../rules/money.js";

/**
 * Chance / Funny-Event outcomes are no longer drawn at random. Landing
 * on one of those tiles resolves deterministically off the exact dice
 * sum (2-12) that produced the roll — the dice roll itself already was
 * the random element, so a second random draw on top of it added nothing
 * but noise and made outcomes impossible to reason about. Each table has
 * exactly one entry per possible sum.
 */
export type EventEffect =
  | { readonly kind: "pay-bank"; readonly amount: number }
  | { readonly kind: "collect-from-bank"; readonly amount: number }
  | { readonly kind: "collect-from-each-player"; readonly amount: number }
  | { readonly kind: "pay-each-player"; readonly amount: number }
  // Street repairs / property assessment: pay the bank a sum scaled by how
  // much you've built — a rare downside to over-developing.
  | { readonly kind: "street-repairs"; readonly perHouse: number; readonly perHotel: number }
  // Rent to the landlord: every other player pays you per property you own,
  // rewarding board control.
  | { readonly kind: "collect-per-property"; readonly amount: number }
  // Movement effects are resolved by the reducer (not here): they move
  // the player and then fully resolve whatever tile is landed on — rent,
  // purchase/auction prompt, tax, or even another event — exactly as a
  // normal roll landing there would.
  | { readonly kind: "advance-to-nearest-transit" }
  | { readonly kind: "advance-to-tile"; readonly position: number }
  | { readonly kind: "move-back-n-spaces"; readonly spaces: number }
  | { readonly kind: "go-to-jail" }
  | { readonly kind: "grant-jail-free-card" };

/** The subset of effects that are pure cash movements the events module
 *  applies directly. Movement effects are excluded — the reducer owns
 *  those because they need to recursively resolve a landed tile. */
export type CashEventEffect = Extract<
  EventEffect,
  {
    readonly kind:
      | "pay-bank"
      | "collect-from-bank"
      | "collect-from-each-player"
      | "pay-each-player"
      | "street-repairs"
      | "collect-per-property";
  }
>;

export interface EventOutcome {
  readonly text: string;
  readonly effect: EventEffect;
}

/** One outcome per possible dice sum (2-12). The dice roll that landed
 *  the player here is the only randomness — the outcome is a pure lookup. */
export const CHANCE_TABLE: Readonly<Record<number, EventOutcome>> = {
  2: {
    text: "Snake eyes — priest says it's inauspicious, donation expected at the temple.",
    effect: { kind: "pay-bank", amount: 50 },
  },
  3: {
    text: "Auto-rickshaw driver actually used the meter. Miracle.",
    effect: { kind: "collect-from-bank", amount: 40 },
  },
  4: {
    text: "Municipal corporation reassesses your plots — repairs due on every house and hotel you've built.",
    effect: { kind: "street-repairs", perHouse: 25, perHotel: 100 },
  },
  5: {
    text: "Won the office Antakshari competition prize money.",
    effect: { kind: "collect-from-bank", amount: 70 },
  },
  6: {
    text: "Muhurat set for the housewarming back home — dash to GO.",
    effect: { kind: "advance-to-tile", position: 0 },
  },
  7: {
    text: "Hit the jackpot at the temple fair tombola stall!",
    effect: { kind: "collect-from-bank", amount: 200 },
  },
  8: {
    text: "Advance to the nearest railway station — pay double rent if owned, or buy it.",
    effect: { kind: "advance-to-nearest-transit" },
  },
  9: {
    text: "Train rescheduled — go back and rebook.",
    effect: { kind: "move-back-n-spaces", spaces: 3 },
  },
  10: {
    text: "Selected for a government subsidy scheme payout.",
    effect: { kind: "collect-from-bank", amount: 120 },
  },
  11: {
    text: "VIP invite to a grand do at the Taj Mahal — advance there (and settle up if it's someone's).",
    effect: { kind: "advance-to-tile", position: 39 },
  },
  12: {
    text: "Double sixes! First prize in the Sankranti kite-flying competition.",
    effect: { kind: "collect-from-bank", amount: 250 },
  },
};

export const FUNNY_TABLE: Readonly<Record<number, EventOutcome>> = {
  2: {
    text: "Power cut right as you were about to win the carrom tournament.",
    effect: { kind: "pay-bank", amount: 30 },
  },
  3: {
    text: "Neighbor's wedding — shagun for the newlyweds.",
    effect: { kind: "pay-each-player", amount: 40 },
  },
  4: {
    text: "Fixed the building's water motor with pure jugaad.",
    effect: { kind: "collect-from-bank", amount: 50 },
  },
  5: {
    text: "Society Ganesh Chaturthi collection.",
    effect: { kind: "collect-from-each-player", amount: 20 },
  },
  6: {
    text: "You're the colony's biggest landlord — every neighbour chips in rent for each plot you hold.",
    effect: { kind: "collect-per-property", amount: 15 },
  },
  7: {
    text: "Won the building's Diwali rangoli competition.",
    effect: { kind: "collect-from-bank", amount: 100 },
  },
  8: {
    text: "Your lawyer cousin pulled some strings.",
    effect: { kind: "grant-jail-free-card" },
  },
  9: {
    text: "Cousin's engagement — shagun time, again.",
    effect: { kind: "pay-each-player", amount: 30 },
  },
  10: {
    text: "Only one with an inverter during load shedding — everyone pays to charge their phones.",
    effect: { kind: "collect-from-each-player", amount: 15 },
  },
  11: {
    text: "Caught without a ticket on the metro.",
    effect: { kind: "go-to-jail" },
  },
  12: {
    text: "Won the office Secret Santa jackpot gift.",
    effect: { kind: "collect-from-bank", amount: 180 },
  },
};

/**
 * Applies a pure cash effect. Movement effects (advance/move-back/jail)
 * are handled by the reducer, which is why this only accepts
 * CashEventEffect — the type system guarantees the switch below is
 * exhaustive over exactly the cash cases.
 */
export function applyEventEffect(
  state: GameState,
  playerId: string,
  effect: CashEventEffect,
): { state: GameState; events: readonly GameEvent[] } {
  const events: GameEvent[] = [];
  let next = state;

  switch (effect.kind) {
    case "pay-bank": {
      const player = next.players.find((p) => p.id === playerId);
      const amount = Math.min(effect.amount, player?.cash ?? 0);
      next = payToBank(next, playerId, amount);
      events.push({ type: "TaxPaid", playerId, amount });
      break;
    }
    case "collect-from-bank": {
      next = payFromBank(next, playerId, effect.amount);
      break;
    }
    case "collect-from-each-player": {
      // Each other player pays what they can, up to the card amount —
      // never pushed negative. Deliberately not a bankruptcy trigger in
      // V1: a five-rupee shortfall on a collection card bankrupting
      // someone would be a worse experience than them just paying what
      // they have. Revisit once the fuller event content pack lands.
      for (const other of next.players) {
        if (other.id === playerId || other.isBankrupt) continue;
        const payer = next.players.find((p) => p.id === other.id);
        const amount = Math.min(effect.amount, payer?.cash ?? 0);
        if (amount <= 0) continue;
        next = payBetweenPlayers(next, other.id, playerId, amount);
      }
      break;
    }
    case "pay-each-player": {
      // The drawing player pays each other player, clamped the same way
      // — if they can't afford the full round, later players in the
      // loop get whatever's left rather than pushing cash negative.
      for (const other of next.players) {
        if (other.id === playerId || other.isBankrupt) continue;
        const payer = next.players.find((p) => p.id === playerId);
        const amount = Math.min(effect.amount, payer?.cash ?? 0);
        if (amount <= 0) continue;
        next = payBetweenPlayers(next, playerId, other.id, amount);
      }
      break;
    }
    case "street-repairs": {
      // Assessment scales with what the player has built. Clamped to their
      // cash like the other bank-payment cards — V1 events don't bankrupt.
      let houses = 0;
      let hotels = 0;
      for (const ownership of Object.values(next.properties)) {
        if (!ownership || ownership.ownerId !== playerId) continue;
        if (ownership.hasHotel) hotels += 1;
        else houses += ownership.houses;
      }
      const player = next.players.find((p) => p.id === playerId);
      const due = houses * effect.perHouse + hotels * effect.perHotel;
      const amount = Math.min(due, player?.cash ?? 0);
      if (amount > 0) {
        next = payToBank(next, playerId, amount);
        events.push({ type: "TaxPaid", playerId, amount });
      }
      break;
    }
    case "collect-per-property": {
      // Landlord's due: each other player pays the drawer per property the
      // drawer owns, clamped to what each can afford (never negative).
      const propertyCount = Object.values(next.properties).filter(
        (ownership) => ownership?.ownerId === playerId,
      ).length;
      const perPlayer = effect.amount * propertyCount;
      if (perPlayer > 0) {
        for (const other of next.players) {
          if (other.id === playerId || other.isBankrupt) continue;
          const payer = next.players.find((p) => p.id === other.id);
          const amount = Math.min(perPlayer, payer?.cash ?? 0);
          if (amount <= 0) continue;
          next = payBetweenPlayers(next, other.id, playerId, amount);
        }
      }
      break;
    }
  }

  return { state: next, events };
}
