import type { GameEvent, GameState } from "../core/types.js";
import { BOARD_SIZE, GO_SALARY, GO_TO_JAIL_POSITION, JAIL_POSITION } from "../economy/index.js";
import { payFromBank, requirePlayer } from "./money.js";

interface MoveResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/**
 * Moves a player forward by `spaces`, paying GO salary if they pass or
 * land on it, and redirecting to jail if they land on Go-To-Jail. Does
 * NOT resolve the tile they land on (rent/purchase/tax/event) — that's
 * the reducer's job once movement is settled.
 */
export function movePlayer(state: GameState, playerId: string, spaces: number): MoveResult {
  const player = requirePlayer(state, playerId);
  const from = player.position;
  const rawTo = from + spaces;
  const to = ((rawTo % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
  const passedGo = rawTo >= BOARD_SIZE;

  let next: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, position: to } : p)),
  };
  const events: GameEvent[] = [{ type: "PlayerMoved", playerId, from, to, steps: spaces }];

  if (passedGo) {
    // Landing *exactly* on GO pays double under that house rule; merely
    // passing it (or landing on it under classic rules) pays the base salary.
    const landedOnGo = to === 0;
    const multiplier = landedOnGo && state.houseRules.doubleGoSalary ? 2 : 1;
    const salary = currentSalary(state) * multiplier;
    next = payFromBank(next, playerId, salary);
    events.push({ type: "PassedGo", playerId, salary });
  }

  if (to === GO_TO_JAIL_POSITION) {
    next = sendToJail(next, playerId);
    events.push({ type: "SentToJail", playerId });
  }

  return { state: next, events };
}

export function sendToJail(state: GameState, playerId: string): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId
        ? { ...p, position: JAIL_POSITION, inJail: true, jailTurnsRemaining: 3 }
        : p,
    ),
  };
}

export function releaseFromJail(state: GameState, playerId: string): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, inJail: false, jailTurnsRemaining: 0 } : p,
    ),
  };
}

/** GO salary escalates over rounds per the mode's anti-slog config. */
export function currentSalary(state: GameState): number {
  const { salaryEscalation } = state.mode;
  const escalations = Math.floor(state.roundNumber / salaryEscalation.everyRounds);
  return GO_SALARY + escalations * salaryEscalation.increaseBy;
}
