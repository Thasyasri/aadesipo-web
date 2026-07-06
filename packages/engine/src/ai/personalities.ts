export type PersonalityId = "miser" | "gambler" | "troll";

export interface PersonalityParams {
  readonly id: PersonalityId;
  /** 0-1. Higher = more willing to spend cash close to the edge. */
  readonly riskAppetite: number;
  /** 0-1. Higher = more likely to accept a trade that's merely fair, not great. */
  readonly tradeFriendliness: number;
  /** 0-1. Higher = bids/builds more aggressively when the valuation is close. */
  readonly aggression: number;
  /** 0-1. Higher = more willing to overpay specifically to deny an opponent a monopoly. */
  readonly spite: number;
  /** Cash the personality tries not to drop below when making voluntary spends. */
  readonly cashReserveTarget: number;
}

/**
 * Difficulty is parameter *quality*, not cheating — every tier uses this
 * exact same valuation model and only sees information any human player
 * would see. See ai/policy.ts's skillLevel for how difficulty is
 * actually implemented (decision noise, not rule-bending).
 */
export const PERSONALITIES: Readonly<Record<PersonalityId, PersonalityParams>> = {
  miser: {
    id: "miser",
    riskAppetite: 0.2,
    tradeFriendliness: 0.3,
    aggression: 0.2,
    spite: 0.1,
    cashReserveTarget: 400,
  },
  gambler: {
    id: "gambler",
    riskAppetite: 0.9,
    tradeFriendliness: 0.6,
    aggression: 0.8,
    spite: 0.3,
    cashReserveTarget: 100,
  },
  troll: {
    id: "troll",
    riskAppetite: 0.6,
    tradeFriendliness: 0.35,
    aggression: 0.7,
    spite: 0.9,
    cashReserveTarget: 150,
  },
} as const;
