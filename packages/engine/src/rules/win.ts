import type { GameState } from "../core/types.js";
import { netWorth } from "./property.js";

export interface WinResult {
  readonly winnerId: string;
  readonly reason: "last-player-standing" | "net-worth-at-cap";
}

export function checkWinCondition(state: GameState): WinResult | null {
  const active = state.players.filter((p) => !p.isBankrupt);

  if (active.length === 1 && active[0]) {
    return { winnerId: active[0].id, reason: "last-player-standing" };
  }
  if (active.length === 0) {
    return null; // Degenerate — shouldn't occur since bankruptcy resolves one player at a time.
  }

  if (state.roundNumber >= state.mode.maxRounds) {
    const ranked = [...active].sort((a, b) => netWorth(state, b.id) - netWorth(state, a.id));
    const leader = ranked[0];
    if (leader) {
      return { winnerId: leader.id, reason: "net-worth-at-cap" };
    }
  }

  return null;
}
