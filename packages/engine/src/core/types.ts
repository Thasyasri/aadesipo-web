import type { RngState } from "../rng/index.js";
import type { HouseRules, ModeConfig, PropertyGroup } from "../economy/index.js";

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------

export type TurnPhase =
  | "awaiting-roll"
  | "awaiting-tile-decision"
  | "awaiting-auction"
  | "resolving-debt" // owes more than cash — must mortgage/sell to cover, or go bankrupt
  | "turn-idle" // tile resolved; player may trade/build/mortgage or end turn
  | "game-over";

/** A payment the current player couldn't afford in cash. Rather than an
 *  instant bankruptcy, they're given a chance to raise the funds (mortgage /
 *  sell buildings) — entered only when full liquidation *could* cover it. */
export interface PendingDebt {
  readonly debtorId: string;
  readonly amount: number;
  /** Who is owed: another player (rent) or null (bank — tax / jail bail). */
  readonly creditorId: string | null;
  readonly reason: "rent" | "tax" | "jail-bail";
  /** For rent: the tile the debt is for (so the RentPaid event is complete). */
  readonly position?: number;
  /** For jail-bail: the roll to resume movement with once bail is paid. */
  readonly diceSum?: number;
}

/** An outstanding bank loan. `owed` starts equal to `principal` and grows by
 *  simple interest each round until repaid; it counts against net worth. */
export interface LoanState {
  readonly principal: number;
  readonly owed: number;
}

export interface PlayerState {
  readonly id: string;
  readonly cash: number;
  readonly position: number;
  readonly inJail: boolean;
  readonly jailTurnsRemaining: number;
  readonly jailFreeCards: number;
  readonly isBankrupt: boolean;
  /** An active bank loan, or null. Only one at a time (repay to borrow again). */
  readonly loan: LoanState | null;
}

export interface PropertyOwnership {
  readonly ownerId: string | null;
  readonly houses: number; // 0-4
  readonly hasHotel: boolean;
  readonly isMortgaged: boolean;
}

/** The bank's remaining house/hotel inventory under the finite-supply house
 *  rule. `null` on a GameState means the rule is off (unlimited building). */
export interface BuildingSupply {
  readonly houses: number;
  readonly hotels: number;
}

export interface AuctionState {
  readonly position: number;
  readonly highestBid: number;
  readonly highestBidderId: string | null;
  readonly activeBidderIds: readonly string[];
  readonly turnBidderId: string;
}

export interface TradeAssets {
  readonly cash: number;
  readonly propertyPositions: readonly number[];
  /** Get-out-of-jail-free cards included in the offer. Optional so trade
   *  actions persisted before cards were tradeable still replay (missing =
   *  0). Read it as `assets.jailFreeCards ?? 0` everywhere. */
  readonly jailFreeCards?: number;
}

export interface TradeOffer {
  readonly id: string;
  readonly proposerId: string;
  readonly recipientId: string;
  readonly proposerGives: TradeAssets;
  readonly recipientGives: TradeAssets;
}

export interface GameState {
  readonly seed: string;
  readonly rng: RngState;
  readonly mode: ModeConfig;
  readonly houseRules: HouseRules;
  readonly players: readonly PlayerState[];
  readonly currentPlayerIndex: number;
  readonly properties: Readonly<Record<number, PropertyOwnership>>;
  readonly bank: number;
  /** Accrued taxes waiting to be scooped up on Free Parking. Always 0
   *  unless the Free-Parking-jackpot house rule is on. */
  readonly freeParkingPot: number;
  /** Remaining bank building inventory, or null when building is unlimited
   *  (the finite-buildings house rule is off). */
  readonly buildingSupply: BuildingSupply | null;
  readonly turnPhase: TurnPhase;
  readonly roundNumber: number;
  readonly doublesStreak: number;
  readonly pendingAuction: AuctionState | null;
  readonly pendingTrade: TradeOffer | null;
  /** Monotonic counter backing deterministic trade ids — so a proposed trade
   *  gets the same id when actions are replayed on resume (a random UUID would
   *  not, breaking the follow-up Accept/Reject match). */
  readonly tradeSeq: number;
  readonly pendingDebt: PendingDebt | null;
  readonly winnerId: string | null;
}

// ---------------------------------------------------------------------
// Actions — proposals. Named as imperatives, per the coding standard.
// ---------------------------------------------------------------------

export type Action =
  | { readonly type: "RollDice"; readonly playerId: string }
  | { readonly type: "PayBail"; readonly playerId: string }
  | { readonly type: "UseJailFreeCard"; readonly playerId: string }
  | { readonly type: "BuyProperty"; readonly playerId: string; readonly position: number }
  | { readonly type: "DeclineProperty"; readonly playerId: string; readonly position: number }
  | { readonly type: "PlaceBid"; readonly playerId: string; readonly amount: number }
  | { readonly type: "PassAuction"; readonly playerId: string }
  | { readonly type: "MortgageProperty"; readonly playerId: string; readonly position: number }
  | { readonly type: "UnmortgageProperty"; readonly playerId: string; readonly position: number }
  | { readonly type: "BuildHouse"; readonly playerId: string; readonly position: number }
  | { readonly type: "SellHouse"; readonly playerId: string; readonly position: number }
  | {
      readonly type: "ProposeTrade";
      readonly proposerId: string;
      readonly recipientId: string;
      readonly proposerGives: TradeAssets;
      readonly recipientGives: TradeAssets;
    }
  | { readonly type: "AcceptTrade"; readonly playerId: string; readonly tradeId: string }
  | { readonly type: "RejectTrade"; readonly playerId: string; readonly tradeId: string }
  | { readonly type: "DeclareBankruptcy"; readonly playerId: string }
  | { readonly type: "SettleDebt"; readonly playerId: string }
  | { readonly type: "TakeLoan"; readonly playerId: string; readonly amount: number }
  | { readonly type: "RepayLoan"; readonly playerId: string; readonly amount: number }
  | { readonly type: "EndTurn"; readonly playerId: string };

// ---------------------------------------------------------------------
// Events — semantic facts (past tense), for the UI to animate from.
// ---------------------------------------------------------------------

export type GameEvent =
  | {
      readonly type: "DiceRolled";
      readonly playerId: string;
      readonly die1: number;
      readonly die2: number;
    }
  | {
      readonly type: "PlayerMoved";
      readonly playerId: string;
      readonly from: number;
      readonly to: number;
      /** Signed board spaces moved (positive forward, negative back). Lets the
       *  UI walk the token the right way and count, since `to` alone is
       *  ambiguous once wrapping is involved. */
      readonly steps: number;
    }
  | { readonly type: "PassedGo"; readonly playerId: string; readonly salary: number }
  | { readonly type: "SentToJail"; readonly playerId: string }
  | { readonly type: "ReleasedFromJail"; readonly playerId: string }
  | {
      readonly type: "PropertyPurchased";
      readonly playerId: string;
      readonly position: number;
      readonly price: number;
    }
  | {
      readonly type: "RentPaid";
      readonly fromId: string;
      readonly toId: string;
      readonly amount: number;
      readonly position: number;
    }
  | { readonly type: "TaxPaid"; readonly playerId: string; readonly amount: number }
  | { readonly type: "JackpotCollected"; readonly playerId: string; readonly amount: number }
  | { readonly type: "LoanTaken"; readonly playerId: string; readonly amount: number }
  | {
      readonly type: "LoanRepaid";
      readonly playerId: string;
      readonly amount: number;
      readonly remaining: number;
    }
  | {
      readonly type: "DebtIncurred";
      readonly playerId: string;
      readonly amount: number;
      readonly creditorId: string | null;
    }
  | {
      readonly type: "EventCardResolved";
      readonly playerId: string;
      readonly deck: "chance" | "funny";
      readonly diceSum: number;
      readonly text: string;
      /** The drawing player's net cash change from this card, when it's a pure
       *  cash card (positive = collected, negative = paid). Undefined for
       *  movement/jail cards, whose consequences surface as their own events. */
      readonly cashDelta?: number;
    }
  | { readonly type: "PropertyDeclined"; readonly playerId: string; readonly position: number }
  | { readonly type: "AuctionStarted"; readonly position: number }
  | { readonly type: "AuctionBid"; readonly playerId: string; readonly amount: number }
  | { readonly type: "AuctionPassed"; readonly playerId: string }
  | {
      readonly type: "AuctionWon";
      readonly playerId: string;
      readonly position: number;
      readonly amount: number;
    }
  | { readonly type: "AuctionVoided"; readonly position: number }
  | {
      readonly type: "PropertyMortgaged";
      readonly playerId: string;
      readonly position: number;
      readonly amount: number;
    }
  | {
      readonly type: "PropertyUnmortgaged";
      readonly playerId: string;
      readonly position: number;
      readonly amount: number;
    }
  | {
      readonly type: "HouseBuilt";
      readonly playerId: string;
      readonly position: number;
      readonly houses: number;
      readonly hasHotel: boolean;
    }
  | {
      readonly type: "HouseSold";
      readonly playerId: string;
      readonly position: number;
      readonly houses: number;
      readonly hasHotel: boolean;
    }
  | { readonly type: "TradeProposed"; readonly trade: TradeOffer }
  | { readonly type: "TradeExecuted"; readonly trade: TradeOffer }
  | { readonly type: "TradeRejected"; readonly tradeId: string }
  | {
      readonly type: "PlayerBankrupted";
      readonly playerId: string;
      readonly creditorId: string | null;
    }
  | { readonly type: "TurnEnded"; readonly playerId: string; readonly nextPlayerId: string }
  | {
      readonly type: "GameEnded";
      readonly winnerId: string;
      readonly reason: "last-player-standing" | "net-worth-at-cap";
    };

export interface Rejection {
  readonly ok: false;
  readonly reason: string;
}

export interface ApplyResult {
  readonly ok: true;
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export type ActionResult = ApplyResult | Rejection;

export function reject(reason: string): Rejection {
  return { ok: false, reason };
}

export function accept(state: GameState, events: readonly GameEvent[]): ApplyResult {
  return { ok: true, state, events };
}

export type { PropertyGroup };
