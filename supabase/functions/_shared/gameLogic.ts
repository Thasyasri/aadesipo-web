/**
 * This file has zero Deno-specific or Supabase-specific dependencies —
 * only the engine. That's deliberate: it's what lets this logic be
 * tested for real (see gameLogic.test.ts, run via the app's normal
 * Vitest/Node setup) even though the Edge Function handlers that call
 * it (../create-room, ../join-room, ../validate-action) can't be
 * executed in this environment. Every Deno-specific line lives in
 * those thin handler files, not here — that's where the untested
 * surface area is concentrated, on purpose.
 */
// Import the *built* engine (dist), not src: Supabase's Deno bundler resolves
// the engine's `.js` import specifiers to literal files, and only dist ships a
// complete, current set of `.js`. (src holds stale/partial compiled artifacts.)
import {
  applyAction,
  createInitialState,
  type Action,
  type GameState,
  type GameEvent,
  type HouseRules,
  type ModeConfig,
} from "../../../packages/engine/dist/index.js";

export function replayToCurrentState(
  seed: string,
  mode: ModeConfig,
  playerIds: readonly string[],
  actionLog: readonly Action[],
  houseRules?: HouseRules,
): GameState {
  let state = createInitialState(seed, mode, playerIds, houseRules);
  for (const action of actionLog) {
    const result = applyAction(state, action);
    if (!result.ok) {
      throw new Error(`Corrupt action log — action rejected on replay: ${result.reason}`);
    }
    state = result.state;
  }
  return state;
}

/**
 * Every Action variant identifies who's performing it, but not always
 * under the same field name (ProposeTrade uses `proposerId`, everything
 * else uses `playerId`) — this is the one place that distinction is
 * handled, so the seat-ownership check below can't accidentally miss it.
 */
export function actorIdForAction(action: Action): string {
  return action.type === "ProposeTrade" ? action.proposerId : action.playerId;
}

export interface ValidateActionResult {
  readonly ok: boolean;
  readonly state?: GameState;
  readonly events?: readonly GameEvent[];
  readonly reason?: string;
}

/**
 * The server-authoritative check every online move goes through: does
 * the authenticated actor actually own the seat this action claims to
 * act as, and is the action itself legal against the current engine
 * state? Both must hold, or nothing is applied.
 */
export function validateAndApplyAction(
  currentState: GameState,
  action: Action,
  actorUserId: string,
): ValidateActionResult {
  const claimedActor = actorIdForAction(action);
  if (claimedActor !== actorUserId) {
    return {
      ok: false,
      reason: `Actor ${actorUserId} does not own seat ${claimedActor} — rejected server-side`,
    };
  }

  const result = applyAction(currentState, action);
  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }
  return { ok: true, state: result.state, events: result.events };
}

/** Server generates the seed at room creation — never trust a client-supplied one. */
export function generateServerSeed(): string {
  return crypto.randomUUID();
}
