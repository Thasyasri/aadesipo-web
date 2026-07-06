import type { GameState } from "../core/types.js";
import { LOAN_MAX_FRACTION } from "../economy/index.js";
import { netWorth } from "./property.js";

/** Average net worth across the players still in the game. */
export function averageNetWorth(state: GameState): number {
  const active = state.players.filter((p) => !p.isBankrupt);
  if (active.length === 0) return 0;
  return active.reduce((sum, p) => sum + netWorth(state, p.id), 0) / active.length;
}

/**
 * Whether a player is "trailing" — below the table's average net worth. The
 * bank loan is a catch-up lever, so only trailing players may borrow (this
 * keeps a leader from using it to snowball further ahead).
 */
export function isTrailing(state: GameState, playerId: string): boolean {
  return netWorth(state, playerId) < averageNetWorth(state);
}

/**
 * The most a player may borrow right now: a fixed fraction of their net worth,
 * floored, and 0 unless they currently hold no loan and are trailing. Never
 * negative.
 */
export function loanCap(state: GameState, playerId: string): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.isBankrupt || player.loan) return 0;
  if (!isTrailing(state, playerId)) return 0;
  return Math.max(0, Math.floor(netWorth(state, playerId) * LOAN_MAX_FRACTION));
}
