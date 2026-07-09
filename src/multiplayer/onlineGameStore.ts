import { create } from "zustand";
import {
  applyAction,
  createInitialState,
  modeById,
  type Action,
  type GameEvent,
  type GameState,
  type HouseRules,
} from "@aadesipo/engine";
import {
  submitAction,
  subscribeToGameActions,
  fetchAllActions,
  type RemoteAction,
} from "./onlineClient";

interface OnlineGameViewState {
  roomId: string | null;
  gameId: string | null;
  myUserId: string | null;
  playerIds: readonly string[];
  /** The room's mode id + house rules — used to rebuild state identically to
   *  how the server validates it. Both replay paths (connect, resync) read
   *  these, so online games honor the host's chosen mode/rules. */
  mode: string;
  houseRules: HouseRules | null;
  confirmedState: GameState | null;
  confirmedSeq: number;
  game: GameState | null;
  recentEvents: readonly GameEvent[];
  /** The full accumulating activity log, rebuilt from the action stream — so
   *  the online game log and trade history match the offline experience. */
  eventLog: readonly GameEvent[];
  lastError: string | null;
  connected: boolean;
  /** How many of OUR actions have been applied optimistically but not yet seen
   *  coming back over realtime. Used to recognise our own echo. */
  pendingLocal: number;

  connect: (
    roomId: string,
    gameId: string,
    seed: string,
    playerIds: readonly string[],
    myUserId: string,
    mode: string,
    houseRules: HouseRules | null,
  ) => Promise<void>;
  disconnect: () => void;
  dispatch: (action: Action) => Promise<void>;
  /** Re-read the whole action log and rebuild. Safe to call any time; used when
   *  the tab regains focus, since a realtime message dropped while hidden would
   *  otherwise leave this client silently stuck a move behind. */
  resyncNow: () => Promise<void>;
}

/** Who is the author of an action — mirrors the server's actorIdForAction, and
 *  is what `validate-action` matches against the authenticated user. */
function actorOf(action: Action): string {
  return action.type === "ProposeTrade" ? action.proposerId : action.playerId;
}

let unsubscribeRealtime: (() => void) | null = null;

/** Rebuilds state + full event log from an action stream, under the room's
 *  mode/house rules. Returns null on a corrupt log (caller surfaces the error). */
function replayStream(
  seed: string,
  mode: string,
  houseRules: HouseRules | null,
  playerIds: readonly string[],
  actions: readonly RemoteAction[],
): { state: GameState; seq: number; eventLog: GameEvent[] } | { error: string } {
  let state = createInitialState(seed, modeById(mode), playerIds, houseRules ?? undefined);
  let seq = 0;
  const eventLog: GameEvent[] = [];
  for (const remote of actions) {
    const result = applyAction(state, remote.action);
    if (!result.ok) return { error: `Action log corrupt at seq ${remote.seq}: ${result.reason}` };
    state = result.state;
    eventLog.push(...result.events);
    seq = remote.seq;
  }
  return { state, seq, eventLog };
}

export const useOnlineGameView = create<OnlineGameViewState>((set, get) => ({
  roomId: null,
  gameId: null,
  myUserId: null,
  playerIds: [],
  mode: "classic",
  houseRules: null,
  confirmedState: null,
  confirmedSeq: 0,
  game: null,
  recentEvents: [],
  eventLog: [],
  lastError: null,
  connected: false,
  pendingLocal: 0,

  connect: async (roomId, gameId, seed, playerIds, myUserId, mode, houseRules) => {
    get().disconnect();

    const pastActions = await fetchAllActions(gameId);
    const replayed = replayStream(seed, mode, houseRules, playerIds, pastActions);
    if ("error" in replayed) {
      set({ lastError: replayed.error });
      return;
    }

    set({
      roomId,
      gameId,
      myUserId,
      playerIds,
      mode,
      houseRules,
      confirmedState: replayed.state,
      confirmedSeq: replayed.seq,
      game: replayed.state,
      recentEvents: [],
      eventLog: replayed.eventLog,
      lastError: null,
      connected: true,
      pendingLocal: 0,
    });

    unsubscribeRealtime = subscribeToGameActions(gameId, (remote: RemoteAction) => {
      handleRemoteAction(set, get, remote);
    });
  },

  disconnect: () => {
    if (unsubscribeRealtime) {
      unsubscribeRealtime();
      unsubscribeRealtime = null;
    }
    set({ connected: false });
  },

  dispatch: async (action) => {
    const { confirmedState, game, gameId } = get();
    if (!confirmedState || !gameId) return;

    // Chain optimism on the LATEST optimistic view, not the last confirmed one.
    // Two quick local actions (buy, then end turn) used to both be applied to
    // the pre-buy board, so the second either bounced or produced a bogus
    // intermediate view until the echoes arrived.
    const optimistic = applyAction(game ?? confirmedState, action);
    if (optimistic.ok) {
      set({
        game: optimistic.state,
        recentEvents: optimistic.events,
        pendingLocal: get().pendingLocal + 1,
      });
    }

    const result = await submitAction(gameId, action);
    if (!result.ok) {
      // Drop every optimistic assumption and let the echoes rebuild. Clearing
      // recentEvents also stops the board animating a move that never happened.
      set({
        game: get().confirmedState,
        recentEvents: [],
        pendingLocal: 0,
        lastError: result.reason ?? result.error ?? "Action rejected",
      });
    }
    // On success we deliberately don't touch state here — the realtime
    // echo (handleRemoteAction) is what actually confirms it, so there's
    // exactly one code path that ever advances confirmedState.
  },

  resyncNow: async () => {
    await resync(set, get);
  },
}));

function handleRemoteAction(
  set: (partial: Partial<OnlineGameViewState>) => void,
  get: () => OnlineGameViewState,
  remote: RemoteAction,
): void {
  const { confirmedState, confirmedSeq, gameId, eventLog, myUserId, pendingLocal } = get();
  if (!confirmedState || !gameId) return;

  if (remote.seq <= confirmedSeq) return;

  if (remote.seq > confirmedSeq + 1) {
    void resync(set, get);
    return;
  }

  const result = applyAction(confirmedState, remote.action);
  if (!result.ok) {
    set({ lastError: `Realtime action failed to apply: ${result.reason}` });
    void resync(set, get);
    return;
  }

  // Our own action coming back. We already animated it optimistically, so keep
  // the EXISTING recentEvents array: handing the board a fresh (if identical)
  // array would re-fire its walk effect — restarting the pawn from the tile it
  // set off from. Confirmed state and the activity log still advance here.
  const isOwnEcho = pendingLocal > 0 && myUserId !== null && actorOf(remote.action) === myUserId;

  set({
    confirmedState: result.state,
    confirmedSeq: remote.seq,
    game: result.state,
    ...(isOwnEcho ? {} : { recentEvents: result.events }),
    eventLog: [...eventLog, ...result.events],
    lastError: null,
    // A rival's action rewound `game` to the confirmed line, so anything we'd
    // applied optimistically is gone — its echo is no longer a duplicate of
    // what's on screen and must be replayed like any other action.
    pendingLocal: isOwnEcho ? pendingLocal - 1 : 0,
  });
}

async function resync(
  set: (partial: Partial<OnlineGameViewState>) => void,
  get: () => OnlineGameViewState,
): Promise<void> {
  const { confirmedState, gameId, playerIds, mode, houseRules } = get();
  if (!confirmedState || !gameId) return;

  const allActions = await fetchAllActions(gameId);
  const replayed = replayStream(confirmedState.seed, mode, houseRules, playerIds, allActions);
  if ("error" in replayed) {
    set({ lastError: `Resync failed — ${replayed.error}` });
    return;
  }
  set({
    confirmedState: replayed.state,
    confirmedSeq: replayed.seq,
    game: replayed.state,
    eventLog: replayed.eventLog,
    lastError: null,
    // The log is the truth now; nothing local is still "pending".
    pendingLocal: 0,
  });
}
