import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Action } from "@aadesipo/engine";
import type { RemoteAction } from "./onlineClient";

vi.mock("./onlineClient", () => ({
  submitAction: vi.fn(),
  subscribeToGameActions: vi.fn(),
  fetchAllActions: vi.fn(),
}));

import { fetchAllActions, submitAction, subscribeToGameActions } from "./onlineClient";
import { useOnlineGameView } from "./onlineGameStore";

const SEED = "test-seed";
const PLAYERS = ["u1", "u2"] as const;
const ME = "u1";

const submitMock = vi.mocked(submitAction);
const subscribeMock = vi.mocked(subscribeToGameActions);
const fetchAllMock = vi.mocked(fetchAllActions);

/** The realtime callback the store handed to subscribeToGameActions. */
let emit: (remote: RemoteAction) => void;

const roll = (playerId: string): Action => ({ type: "RollDice", playerId });

async function connectFresh(pastActions: RemoteAction[] = []) {
  fetchAllMock.mockResolvedValue(pastActions);
  subscribeMock.mockImplementation((_gameId, handler) => {
    emit = handler;
    return () => {};
  });
  await useOnlineGameView
    .getState()
    .connect("room-1", "game-1", SEED, PLAYERS, ME, "classic", null);
}

beforeEach(() => {
  vi.clearAllMocks();
  submitMock.mockResolvedValue({ ok: true, seq: 1 });
  useOnlineGameView.setState({
    roomId: null,
    gameId: null,
    myUserId: null,
    playerIds: [],
    confirmedState: null,
    confirmedSeq: 0,
    game: null,
    recentEvents: [],
    eventLog: [],
    lastError: null,
    connected: false,
    pendingLocal: 0,
  });
});

describe("online game store", () => {
  it("replays the action log on connect", async () => {
    await connectFresh();
    const s = useOnlineGameView.getState();
    expect(s.connected).toBe(true);
    expect(s.game).not.toBeNull();
    expect(s.confirmedSeq).toBe(0);
    expect(s.pendingLocal).toBe(0);
  });

  it("applies our action optimistically before the server confirms", async () => {
    await connectFresh();
    const before = useOnlineGameView.getState().game;

    await useOnlineGameView.getState().dispatch(roll(ME));

    const s = useOnlineGameView.getState();
    expect(s.game).not.toBe(before);
    expect(s.recentEvents.length).toBeGreaterThan(0);
    expect(s.pendingLocal).toBe(1);
    // Only the realtime echo is allowed to advance the confirmed line.
    expect(s.confirmedState).toBe(before);
    expect(s.confirmedSeq).toBe(0);
  });

  it("does not re-emit recentEvents when our own action echoes back", async () => {
    await connectFresh();
    await useOnlineGameView.getState().dispatch(roll(ME));
    const optimisticEvents = useOnlineGameView.getState().recentEvents;

    emit({ seq: 1, action: roll(ME) });

    const s = useOnlineGameView.getState();
    // Identity matters: the board keys its walk animation off this array, so a
    // fresh-but-equal array would restart the pawn from where it set off.
    expect(s.recentEvents).toBe(optimisticEvents);
    expect(s.confirmedSeq).toBe(1);
    expect(s.pendingLocal).toBe(0);
    // ...but the activity log still gains the confirmed events exactly once.
    expect(s.eventLog.length).toBe(optimisticEvents.length);
  });

  it("emits recentEvents for a rival's action", async () => {
    await connectFresh();
    const before = useOnlineGameView.getState().recentEvents;

    emit({ seq: 1, action: roll("u1") }); // u1 acts first; u2 is the rival below

    const mid = useOnlineGameView.getState();
    expect(mid.recentEvents).not.toBe(before);
    expect(mid.recentEvents.length).toBeGreaterThan(0);
  });

  it("chains a second optimistic action on the first, not on confirmed state", async () => {
    await connectFresh();
    await useOnlineGameView.getState().dispatch(roll(ME));
    const afterRoll = useOnlineGameView.getState().game!;

    // Whatever the roll landed on, this follow-up is legal in the post-roll
    // phase and illegal before it. If the store rebased on confirmedState
    // (still pre-roll) the engine would reject it and `game` wouldn't move.
    const myPosition = afterRoll.players.find((p) => p.id === ME)?.position ?? 0;
    const followUp: Action =
      afterRoll.turnPhase === "awaiting-tile-decision"
        ? { type: "DeclineProperty", playerId: ME, position: myPosition }
        : { type: "EndTurn", playerId: ME };
    await useOnlineGameView.getState().dispatch(followUp);

    const s = useOnlineGameView.getState();
    expect(s.pendingLocal).toBe(2);
    expect(s.game).not.toBe(afterRoll);
  });

  it("rolls back cleanly when the server rejects our action", async () => {
    await connectFresh();
    const before = useOnlineGameView.getState().game;
    submitMock.mockResolvedValue({ ok: false, reason: "not-your-turn" });

    await useOnlineGameView.getState().dispatch(roll(ME));

    const s = useOnlineGameView.getState();
    expect(s.game).toBe(before);
    // The board must not animate a move that never happened.
    expect(s.recentEvents).toEqual([]);
    expect(s.pendingLocal).toBe(0);
    expect(s.lastError).toBe("not-your-turn");
  });

  it("drops our pending optimism when a rival's action lands first", async () => {
    await connectFresh();
    await useOnlineGameView.getState().dispatch(roll(ME));
    expect(useOnlineGameView.getState().pendingLocal).toBe(1);

    // Someone else's action commits at seq 1; our optimistic view is discarded,
    // so our own echo (whenever it arrives) is no longer a duplicate.
    emit({ seq: 1, action: roll("u1") });

    expect(useOnlineGameView.getState().pendingLocal).toBe(0);
  });

  it("ignores an action we have already confirmed", async () => {
    await connectFresh();
    emit({ seq: 1, action: roll("u1") });
    const s1 = useOnlineGameView.getState();

    emit({ seq: 1, action: roll("u1") });

    const s2 = useOnlineGameView.getState();
    expect(s2.confirmedSeq).toBe(1);
    expect(s2.game).toBe(s1.game);
    expect(s2.eventLog).toBe(s1.eventLog);
  });

  it("resyncs from the full log when a realtime message is missed", async () => {
    await connectFresh();
    fetchAllMock.mockResolvedValue([{ seq: 1, action: roll("u1") }]);

    // seq 2 arrives while we're still at 0 — seq 1 was dropped.
    emit({ seq: 2, action: { type: "EndTurn", playerId: "u1" } });
    await vi.waitFor(() => expect(useOnlineGameView.getState().confirmedSeq).toBe(1));

    expect(fetchAllMock).toHaveBeenCalledTimes(2); // connect + resync
    expect(useOnlineGameView.getState().lastError).toBeNull();
  });

  it("resyncNow rebuilds from the log and clears pending optimism", async () => {
    await connectFresh();
    await useOnlineGameView.getState().dispatch(roll(ME));
    fetchAllMock.mockResolvedValue([{ seq: 1, action: roll(ME) }]);

    await useOnlineGameView.getState().resyncNow();

    const s = useOnlineGameView.getState();
    expect(s.confirmedSeq).toBe(1);
    expect(s.pendingLocal).toBe(0);
    expect(s.eventLog.length).toBeGreaterThan(0);
  });

  it("surfaces a corrupt action log rather than applying it", async () => {
    // u2 cannot roll on u1's turn — replay must fail loudly.
    await connectFresh([{ seq: 1, action: roll("u2") }]);

    const s = useOnlineGameView.getState();
    expect(s.lastError).toMatch(/corrupt/i);
    expect(s.connected).toBe(false);
    expect(s.game).toBeNull();
  });
});
