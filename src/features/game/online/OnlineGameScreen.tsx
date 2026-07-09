import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { getActingPlayerId, type Action } from "@aadesipo/engine";
import { useSession } from "@/state/session";
import { useOnlineGameView } from "@/multiplayer/onlineGameStore";
import {
  fetchActiveGameForRoom,
  fetchRoomSeats,
  fetchRoomInfo,
  fetchProfiles,
} from "@/multiplayer/onlineClient";
import { useTurnPresence } from "./useTurnPresence";
import { Board } from "../board/Board";
import { PlayerStrip } from "../hud/PlayerStrip";
import { ActionDock } from "../hud/ActionDock";
import { BuyPropertySheet } from "../sheets/BuyPropertySheet";
import { AuctionSheet } from "../sheets/AuctionSheet";
import { PropertiesSheet } from "../sheets/PropertiesSheet";
import { TileDetailSheet } from "../sheets/TileDetailSheet";
import { EventTablesSheet } from "../sheets/EventTablesSheet";
import { TradeSheet } from "../sheets/TradeSheet";
import { ActivitySounds, RecentActivity } from "../GameLog";
import { ActivitySheet } from "../sheets/ActivitySheet";
import { LastRoll } from "../dice/LastRoll";
import { VictoryDialog } from "../VictoryDialog";
import { DiceCeremony } from "../dice/DiceCeremony";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import type { PlayerSetup } from "@/state/gameStore";

export function OnlineGameScreen() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useSession();
  const storeRoomId = useOnlineGameView((s) => s.roomId);
  const onlineGameId = useOnlineGameView((s) => s.gameId);
  const game = useOnlineGameView((s) => s.game);
  const playerIds = useOnlineGameView((s) => s.playerIds);
  const recentEvents = useOnlineGameView((s) => s.recentEvents);
  const eventLog = useOnlineGameView((s) => s.eventLog);
  const lastError = useOnlineGameView((s) => s.lastError);
  const connect = useOnlineGameView((s) => s.connect);
  const resyncNow = useOnlineGameView((s) => s.resyncNow);
  const dispatchAsync = useOnlineGameView((s) => s.dispatch);
  const navigate = useNavigate();
  // The rest of the game UI dispatches synchronously; online sends over the
  // wire, so adapt the signature here rather than in every child.
  const dispatch = (action: Action) => void dispatchAsync(action);

  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [inspectPosition, setInspectPosition] = useState<number | null>(null);
  const [eventTablesOpen, setEventTablesOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  // The board reports exactly when a pawn is walking; the turn waits on it (see
  // GameScreen for the same treatment). Replaces a timer that only *guessed*
  // the walk duration and drifted out of step with the real animation.
  const [animating, setAnimating] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (!roomId || !user || storeRoomId === roomId) return;
    if (attempted.current === roomId) return;
    attempted.current = roomId;
    setConnecting(true);
    void (async () => {
      try {
        const active = await fetchActiveGameForRoom(roomId);
        if (!active) throw new Error("This room doesn't have an active game.");
        const [seats, roomInfo] = await Promise.all([
          fetchRoomSeats(roomId),
          fetchRoomInfo(roomId),
        ]);
        await connect(
          roomId,
          active.gameId,
          active.seed,
          seats.map((s) => s.userId),
          user.id,
          roomInfo.mode,
          roomInfo.houseRules,
        );
      } catch (err) {
        setConnectError((err as Error).message);
      } finally {
        setConnecting(false);
      }
    })();
  }, [roomId, user, storeRoomId, connect]);

  // Real names for the board, player strip and activity log. Without this the
  // log reads "Player 2 rolled 3 + 4" for everyone but you.
  useEffect(() => {
    if (playerIds.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const profiles = await fetchProfiles(playerIds);
        if (cancelled) return;
        const resolved: Record<string, string> = {};
        for (const [id, profile] of Object.entries(profiles)) {
          if (profile.displayName) resolved[id] = profile.displayName;
        }
        setNames(resolved);
      } catch {
        // Names are cosmetic — a failure here just leaves the seat fallbacks.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playerIds]);

  // A realtime message dropped while the tab was hidden (or the socket was
  // asleep) would otherwise leave this client silently a move behind, with no
  // way back: `handleRemoteAction` only resyncs when a *later* message arrives.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void resyncNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [resyncNow]);

  // Computed before the early returns below, because hooks can't be conditional.
  const actingId = game && game.turnPhase !== "game-over" ? getActingPlayerId(game) : "";
  const presence = useTurnPresence(
    roomId ?? null,
    onlineGameId,
    actingId,
    actingId !== "" && actingId === user?.id,
  );

  if (connecting || (!game && !connectError)) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Card>
          <p className="text-body text-text-secondary">Connecting…</p>
        </Card>
      </div>
    );
  }

  if (connectError || !game || !user) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Card>
          <p className="mb-4 text-body text-semantic-error">
            {connectError ?? "Could not load this game."}
          </p>
          <Button variant="primary" onClick={() => navigate("/play")}>
            Back to home
          </Button>
        </Card>
      </div>
    );
  }

  const actingPlayerId = actingId;
  const isActingPlayerLocal = actingPlayerId === user.id;

  const displaySetups: PlayerSetup[] = playerIds.map((id, i) => ({
    id,
    displayName: id === user.id ? "You" : (names[id] ?? `Player ${i + 1}`),
  }));

  // Online: this device controls exactly the signed-in user's seat.
  const localHumanId = game.turnPhase === "game-over" ? null : user.id;
  const tradeBadge = game.turnPhase !== "game-over" && game.pendingTrade?.recipientId === user.id;

  // The local acting player owes more than their cash — surface the raise-funds
  // prompt in the action dock (same as offline).
  const debt = game.pendingDebt;
  const debtPrompt =
    debt && debt.debtorId === actingPlayerId && isActingPlayerLocal
      ? {
          amount: debt.amount,
          creditorName: debt.creditorId
            ? (displaySetups.find((p) => p.id === debt.creditorId)?.displayName ?? debt.creditorId)
            : "the bank",
          canSettle: (game.players.find((p) => p.id === actingPlayerId)?.cash ?? 0) >= debt.amount,
          onSettle: () => dispatch({ type: "SettleDebt", playerId: actingPlayerId }),
          onDeclareBankruptcy: () =>
            dispatch({ type: "DeclareBankruptcy", playerId: actingPlayerId }),
        }
      : null;

  return (
    <>
      {/* Two-column from tablets up (board left, all info/controls right); a
          single stacked column on phones — identical to the offline layout. */}
      <div className="flex flex-col md:flex-row md:items-start md:gap-4 md:p-4">
        <div className="w-full md:w-[68%] md:shrink-0">
          <Board
            game={game}
            players={displaySetups}
            events={recentEvents}
            onSelectTile={setInspectPosition}
            onSelectEmblem={() => setEventTablesOpen(true)}
            onAnimatingChange={setAnimating}
          />
        </div>

        <div className="flex w-full min-h-0 flex-col md:w-[32%]">
          <PlayerStrip game={game} players={displaySetups} events={recentEvents} />

          <LastRoll events={eventLog} />

          <RecentActivity
            events={eventLog}
            players={displaySetups}
            onOpenFull={() => setActivityOpen(true)}
          />

          {presence.stalled && (
            <div className="mx-4 mb-2 flex flex-col gap-2 rounded-md border border-bg-raised bg-bg-surface p-3">
              <p className="text-body text-text-secondary">
                {displaySetups.find((p) => p.id === actingPlayerId)?.displayName ?? "That player"}{" "}
                hasn't moved in a while
                {presence.idleSeconds !== null && ` (${Math.floor(presence.idleSeconds / 60)}m)`}.
              </p>
              <Button
                variant="secondary"
                disabled={presence.takingOver}
                onClick={presence.takeOver}
              >
                {presence.takingOver ? "Playing their turn…" : "Play their turn for them"}
              </Button>
              {presence.error && (
                <p className="text-caption text-semantic-error">{presence.error}</p>
              )}
            </div>
          )}

          {lastError && (
            <p className="px-4 py-2 text-center text-caption text-semantic-error">{lastError}</p>
          )}

          <ActionDock
            game={game}
            actingPlayerId={actingPlayerId}
            isActingPlayerLocal={isActingPlayerLocal}
            busy={animating}
            onOpenProperties={() => setPropertiesOpen(true)}
            onOpenActivity={() => setActivityOpen(true)}
            onOpenTrade={() => setTradeOpen(true)}
            tradeBadge={tradeBadge}
            debtPrompt={debtPrompt}
            dispatch={dispatch}
          />
        </div>
      </div>

      <ActivitySounds events={eventLog} />
      <ActivitySheet
        events={eventLog}
        players={displaySetups}
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
      />

      <DiceCeremony events={recentEvents} />
      {!animating && (
        <BuyPropertySheet
          game={game}
          actingPlayerId={actingPlayerId}
          isActingPlayerLocal={isActingPlayerLocal}
          dispatch={dispatch}
        />
      )}
      <AuctionSheet
        game={game}
        players={displaySetups}
        actingPlayerId={actingPlayerId}
        isActingPlayerLocal={isActingPlayerLocal}
        dispatch={dispatch}
        onInspect={setInspectPosition}
      />
      <PropertiesSheet
        game={game}
        // This device owns exactly the signed-in user's seat — never the acting
        // player's, or every rival would see (and try to sell) their buildings.
        playerId={user.id}
        // Off-turn building/mortgaging is legal (the engine has no turn guard on
        // it) and validate-action accepts it, since it only checks that the
        // action's actor is the authenticated user.
        canManage={!animating && game.turnPhase !== "game-over"}
        open={propertiesOpen}
        onClose={() => setPropertiesOpen(false)}
        dispatch={dispatch}
        onInspect={setInspectPosition}
      />
      <EventTablesSheet open={eventTablesOpen} onClose={() => setEventTablesOpen(false)} />
      {localHumanId && (
        <TradeSheet
          game={game}
          players={displaySetups}
          currentPlayerId={localHumanId}
          localPlayerIds={[user.id]}
          eventLog={eventLog}
          open={tradeOpen}
          onClose={() => setTradeOpen(false)}
          dispatch={dispatch}
          onInspect={setInspectPosition}
        />
      )}
      {/* Rendered last so its portal layers on top of Properties/Trade. */}
      <TileDetailSheet
        game={game}
        players={displaySetups}
        position={inspectPosition}
        onClose={() => setInspectPosition(null)}
      />
      <VictoryDialog
        gameId={onlineGameId}
        game={game}
        players={displaySetups}
        mode="online"
        localPlayerId={user.id}
        onPlayAgain={() => navigate("/play")}
      />
    </>
  );
}
