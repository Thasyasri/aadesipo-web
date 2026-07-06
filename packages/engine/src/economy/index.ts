export * from "./board.js";

/**
 * The ModeConfig abstraction agreed on for mode-driven economy: Quick
 * and Marathon (Future) slot in here as sibling configs without any
 * engine changes — the reducer reads mode.* fields, never mode names.
 */
export interface ModeConfig {
  readonly id: "classic" | "quick" | "marathon";
  readonly startingCash: number;
  /** Soft time cap: after this many completed rounds, the win check
   *  switches from "last player standing" to "highest net worth". */
  readonly maxRounds: number;
  /** Every this many rounds, GO salary increases — an anti-slog lever. */
  readonly salaryEscalation: { readonly everyRounds: number; readonly increaseBy: number };
}

export const CLASSIC_MODE: ModeConfig = {
  id: "classic",
  startingCash: 1500,
  maxRounds: 40,
  salaryEscalation: { everyRounds: 10, increaseBy: 50 },
};

/** Short session: a bigger opening bankroll, aggressive salary escalation, and
 *  a low round cap, so the net-worth win kicks in fast (~coffee-break length). */
export const QUICK_MODE: ModeConfig = {
  id: "quick",
  startingCash: 2500,
  maxRounds: 15,
  salaryEscalation: { everyRounds: 4, increaseBy: 100 },
};

/** Long session: classic bankroll, gentle escalation, and a high round cap, so
 *  games tend to resolve by elimination rather than the net-worth timer. */
export const MARATHON_MODE: ModeConfig = {
  id: "marathon",
  startingCash: 1500,
  maxRounds: 80,
  salaryEscalation: { everyRounds: 15, increaseBy: 25 },
};

/** All selectable modes, in display order. */
export const GAME_MODES: readonly ModeConfig[] = [CLASSIC_MODE, QUICK_MODE, MARATHON_MODE];

/** Resolve a stored mode id back to its config (falling back to classic) —
 *  used by the online layer, which persists just the id string in the DB. */
export function modeById(id: string | null | undefined): ModeConfig {
  return GAME_MODES.find((m) => m.id === id) ?? CLASSIC_MODE;
}

/** Effectively unlimited for gameplay purposes; finite so "total money
 *  in the system is conserved" is a checkable invariant in tests. */
export const BANK_STARTING_BALANCE = 1_000_000_000;

/**
 * Optional, opt-in rule tweaks chosen at game start — orthogonal to the
 * economy `ModeConfig` (which is a fixed preset). These are the familiar
 * "house rules" levers: they change how a few existing systems behave but
 * add no new ones. Defaults reproduce classic play exactly, so a game
 * created without touching them is identical to before this feature.
 */
export interface HouseRules {
  /** Opening bankroll for every player (a preset chosen in setup). */
  readonly startingCash: number;
  /** Taxes feed a Free Parking pot that the next player to land there
   *  scoops up, instead of vanishing into the bank. */
  readonly freeParkingJackpot: boolean;
  /** A declined property stays unowned rather than going to auction. */
  readonly noAuction: boolean;
  /** Landing *exactly* on GO (not merely passing it) pays double salary. */
  readonly doubleGoSalary: boolean;
  /** The bank holds a fixed pool of houses/hotels; when it runs dry, no one
   *  can build until someone sells — turning development into a denial game. */
  readonly finiteBuildings: boolean;
  /** Houses must be built (and sold) evenly across the properties you own in a
   *  colour group — no stacking one tile while its neighbours stay bare. */
  readonly evenBuilding: boolean;
}

/** Bank building inventory for the finite-supply house rule (classic
 *  Monopoly quantities). Ignored entirely when the rule is off. */
export const HOUSE_SUPPLY = 32;
export const HOTEL_SUPPLY = 12;

/** Bank-loan comeback lever. A trailing player may borrow up to this fraction
 *  of their net worth; the debt grows by this simple-interest rate per round. */
export const LOAN_MAX_FRACTION = 0.5;
export const LOAN_INTEREST_PER_ROUND = 0.1;

/** The starting-cash presets offered in setup (engine units — display ×1000). */
export const STARTING_CASH_PRESETS = [1000, 1500, 2000, 2500] as const;

export const DEFAULT_HOUSE_RULES: HouseRules = {
  startingCash: CLASSIC_MODE.startingCash,
  freeParkingJackpot: false,
  noAuction: false,
  doubleGoSalary: false,
  finiteBuildings: false,
  evenBuilding: false,
};
