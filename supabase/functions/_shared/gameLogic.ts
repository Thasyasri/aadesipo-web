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
  chooseAiAction,
  createInitialState,
  createRngState,
  getActingPlayerId,
  getTile,
  netWorth,
  PERSONALITIES,
  type Action,
  type GameState,
  type GameEvent,
  type HouseRules,
  type ModeConfig,
  type PropertyTile,
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

/**
 * Enough to carry any single stalled turn to its end without letting a
 * pathological loop run away. Generous because one turn can be long: a doubles
 * chain, then a debt resolved by mortgaging several properties, then a run of
 * BuildHouse actions (the AI issues one per decision) before EndTurn.
 *
 * Hitting the cap is not a deadlock — the turn simply hasn't passed yet, and the
 * next advance-turn call picks up where this one stopped. But every extra call
 * is another minute of a stuck game, so leave headroom.
 */
export const MAX_TAKEOVER_ACTIONS = 40;

/**
 * Play a disconnected player's turn for them, so one closed tab can't deadlock
 * a game forever. Nobody else can act while it's their turn — the engine won't
 * allow it — so the only way out is to act *as* them, which no client is ever
 * permitted to do. Hence: the server does it.
 *
 * The stand-in is the Miser personality at full skill — the most conservative
 * of the three, so an absent player's position is played safe rather than
 * gambled with. Actions are derived from a seeded RNG keyed on the game and the
 * log length, so a retried call plans exactly the same moves.
 *
 * Returns the actions to append, in order, and the state they lead to. `actions`
 * is empty if it isn't the absent player's turn after all (they came back and
 * moved, or someone else acted), in which case `finalState` is the input state.
 */
export function planTakeoverActions(
  state: GameState,
  absentPlayerId: string,
  rngSeed: string,
): { readonly actions: readonly Action[]; readonly finalState: GameState } {
  const config = { personality: PERSONALITIES.miser, skillLevel: 1 };
  const actions: Action[] = [];
  let rng = createRngState(rngSeed);
  let current = state;

  while (actions.length < MAX_TAKEOVER_ACTIONS) {
    if (current.turnPhase === "game-over") break;
    // getActingPlayerId also names the auction's turn-bidder, so a stalled
    // bidder is unstuck the same way — and the loop stops as soon as the turn
    // (or the bid) passes to someone else.
    if (getActingPlayerId(current) !== absentPlayerId) break;

    const decision = chooseAiAction(current, config, rng);
    rng = decision.nextRng;

    const result = applyAction(current, decision.action);
    if (!result.ok) break; // never append an action the engine would reject
    current = result.state;
    actions.push(decision.action);
  }

  return { actions, finalState: current };
}

export interface DerivedGameResult {
  readonly mode: string;
  readonly playerCount: number;
  readonly won: boolean;
  readonly reason: "last-player-standing" | "net-worth-at-cap";
  readonly netWorth: number;
  readonly rank: number;
  readonly rounds: number;
  readonly cities: readonly string[];
}

/**
 * Derive one player's result from a finished game's replayed state.
 *
 * This exists so the server never takes a client's word for who won, what they
 * were worth, or where they placed — those feed the public leaderboard, and the
 * client had every incentive to lie. The shape deliberately mirrors
 * `recordGameResult` in src/services/stats.ts; that copy still writes local
 * `vs-ai` rows (private stats), but online rows now come from here.
 *
 * Returns null if the game isn't actually over, or the user wasn't in it.
 */
export function deriveGameResult(state: GameState, userId: string): DerivedGameResult | null {
  if (state.turnPhase !== "game-over" || !state.winnerId) return null;
  if (!state.players.some((p) => p.id === userId)) return null;

  const ranked = [...state.players].sort((a, b) => netWorth(state, b.id) - netWorth(state, a.id));
  const rank = ranked.findIndex((p) => p.id === userId) + 1;

  const cities = Object.entries(state.properties)
    .filter(([, ownership]) => ownership.ownerId === userId)
    .map(([position]) => getTile(Number(position)))
    .filter((tile): tile is PropertyTile => tile.type === "property")
    .map((tile) => tile.name);

  return {
    mode: state.mode.id,
    playerCount: state.players.length,
    won: state.winnerId === userId,
    reason:
      state.players.filter((p) => !p.isBankrupt).length === 1
        ? "last-player-standing"
        : "net-worth-at-cap",
    netWorth: netWorth(state, userId),
    rank: rank > 0 ? rank : state.players.length,
    rounds: state.roundNumber,
    cities,
  };
}
