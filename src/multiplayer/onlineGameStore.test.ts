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
/** The channel-status callback — fires again whenever a dropped socket rejoins. */
let emitSubscribed: () => void;

const roll = (playerId: string): Action => ({ type: "RollDice", playerId });

/**
 * @param me Which seat this client owns. Defaults to u1, who acts first. Pass
 *   "u2" to make u1's actions genuinely belong to a RIVAL — otherwise a test
 *   that emits `roll("u1")` is emitting the local player's own action, and any
 *   assertion about rival handling passes for the wrong reason.
 */
async function connectFresh(pastActions: RemoteAction[] = [], me: string = ME) {
  fetchAllMock.mockResolvedValue(pastActions);
  subscribeMock.mockImplementation((_gameId, handler, onSubscribed) => {
    emit = handler;
    emitSubscribed = () => onSubscribed?.();
    onSubscribed?.(); // the real channel reaches SUBSCRIBED right after connect
    return () => {};
  });
  await useOnlineGameView
    .getState()
    .connect("room-1", "game-1", SEED, PLAYERS, me, "classic", null);
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

  it("emits recentEvents for a rival's action, so the board animates it", async () => {
    await connectFresh([], "u2"); // we're u2; u1 acts first, so u1 is the rival
    const before = useOnlineGameView.getState().recentEvents;

    emit({ seq: 1, action: roll("u1") });

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
    // We're u2, so u1's roll below is a genuine rival action. We can't reach
    // pendingLocal > 0 through a legal off-turn dispatch here (u2 owns nothing
    // yet), so seed it directly: what's under test is the branch in
    // handleRemoteAction, not how the counter got there.
    await connectFresh([], "u2");
    useOnlineGameView.setState({ pendingLocal: 1 });
    const staleEvents = useOnlineGameView.getState().recentEvents;

    emit({ seq: 1, action: roll("u1") });

    const s = useOnlineGameView.getState();
    // A rival's action rewinds `game` to the confirmed line, so our optimistic
    // apply is gone: its echo is no longer a duplicate and must replay normally.
    expect(s.pendingLocal).toBe(0);
    // And this action is not ours, so the board must animate it.
    expect(s.recentEvents).not.toBe(staleEvents);
  });

  it("treats an action by us and one by a rival differently at the same pendingLocal", async () => {
    // The whole reason actorOf() exists. Same seq, same pendingLocal, same
    // action shape — only the authoring seat differs, and that must decide
    // whether the board re-animates.
    await connectFresh([], "u1");
    useOnlineGameView.setState({ pendingLocal: 1 });
    const mine = useOnlineGameView.getState().recentEvents;
    emit({ seq: 1, action: roll("u1") }); // authored by us
    expect(useOnlineGameView.getState().recentEvents).toBe(mine);

    await connectFresh([], "u2");
    useOnlineGameView.setState({ pendingLocal: 1 });
    const theirs = useOnlineGameView.getState().recentEvents;
    emit({ seq: 1, action: roll("u1") }); // identical action, authored by a rival
    expect(useOnlineGameView.getState().recentEvents).not.toBe(theirs);
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

  it("catches up when a dropped realtime socket rejoins", async () => {
    await connectFresh();
    expect(fetchAllMock).toHaveBeenCalledTimes(1); // the initial SUBSCRIBED must not resync

    // While we were disconnected, u1 rolled. postgres_changes has no replay, so
    // that INSERT is never delivered — the rejoin is our only hint we missed it.
    fetchAllMock.mockResolvedValue([{ seq: 1, action: roll("u1") }]);
    emitSubscribed();

    await vi.waitFor(() => expect(useOnlineGameView.getState().confirmedSeq).toBe(1));
    expect(fetchAllMock).toHaveBeenCalledTimes(2);
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
