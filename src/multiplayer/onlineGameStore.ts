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
    const { confirmedState, gameId } = get();
    if (!confirmedState || !gameId) return;

    const optimistic = applyAction(confirmedState, action);
    if (optimistic.ok) {
      set({ game: optimistic.state, recentEvents: optimistic.events });
    }

    const result = await submitAction(gameId, action);
    if (!result.ok) {
      set({
        game: get().confirmedState,
        lastError: result.reason ?? result.error ?? "Action rejected",
      });
    }
    // On success we deliberately don't touch state here — the realtime
    // echo (handleRemoteAction) is what actually confirms it, so there's
    // exactly one code path that ever advances confirmedState.
  },
}));

function handleRemoteAction(
  set: (partial: Partial<OnlineGameViewState>) => void,
  get: () => OnlineGameViewState,
  remote: RemoteAction,
): void {
  const { confirmedState, confirmedSeq, gameId, eventLog } = get();
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

  set({
    confirmedState: result.state,
    confirmedSeq: remote.seq,
    game: result.state,
    recentEvents: result.events,
    eventLog: [...eventLog, ...result.events],
    lastError: null,
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
  });
}
