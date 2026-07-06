import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { getActingPlayerId, type Action } from "@aadesipo/engine";
import { useSession } from "@/state/session";
import { useOnlineGameView } from "@/multiplayer/onlineGameStore";
import { fetchActiveGameForRoom, fetchRoomSeats, fetchRoomInfo } from "@/multiplayer/onlineClient";
import {
  Board,
  WALK_STEP_CAP,
  WALK_START_DELAY_MS,
  APPROX_MS_PER_TILE,
} from "../board/Board";
import { PlayerStrip } from "../hud/PlayerStrip";
import { ActionDock } from "../hud/ActionDock";
import { BuyPropertySheet } from "../sheets/BuyPropertySheet";
import { AuctionSheet } from "../sheets/AuctionSheet";
import { PropertiesSheet } from "../sheets/PropertiesSheet";
import { TileDetailSheet } from "../sheets/TileDetailSheet";
import { EventTablesSheet } from "../sheets/EventTablesSheet";
import { TradeSheet } from "../sheets/TradeSheet";
import { GameLog } from "../GameLog";
import { VictoryDialog } from "../VictoryDialog";
import { DiceCeremony } from "../dice/DiceCeremony";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import type { PlayerSetup } from "@/state/gameStore";

export function OnlineGameScreen() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useSession();
  const storeRoomId = useOnlineGameView((s) => s.roomId);
  const game = useOnlineGameView((s) => s.game);
  const playerIds = useOnlineGameView((s) => s.playerIds);
  const recentEvents = useOnlineGameView((s) => s.recentEvents);
  const eventLog = useOnlineGameView((s) => s.eventLog);
  const lastError = useOnlineGameView((s) => s.lastError);
  const connect = useOnlineGameView((s) => s.connect);
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
  // While the token walks its tiles after a roll, hold back the landing (buy)
  // sheet so it doesn't cover the board — the coin arrives first, then decide.
  const [walking, setWalking] = useState(false);
  const attempted = useRef<string | null>(null);

  // Suppress the landing sheet for roughly as long as the token's walk takes.
  useEffect(() => {
    const hasRoll = recentEvents.some((e) => e.type === "DiceRolled");
    const tiles = recentEvents.reduce((sum, e) => {
      if (e.type === "PlayerMoved") {
        const n = Math.abs(e.steps);
        return sum + (n > WALK_STEP_CAP ? 1 : n);
      }
      if (e.type === "SentToJail") return sum + 1;
      return sum;
    }, 0);
    if (!hasRoll || tiles === 0) return;
    setWalking(true);
    const timer = window.setTimeout(
      () => setWalking(false),
      WALK_START_DELAY_MS + tiles * APPROX_MS_PER_TILE + 200,
    );
    return () => window.clearTimeout(timer);
  }, [recentEvents]);

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
          <Button variant="primary" onClick={() => navigate("/")}>
            Back to home
          </Button>
        </Card>
      </div>
    );
  }

  const actingPlayerId = game.turnPhase === "game-over" ? "" : getActingPlayerId(game);
  const isActingPlayerLocal = actingPlayerId === user.id;

  const displaySetups: PlayerSetup[] = playerIds.map((id, i) => ({
    id,
    displayName: id === user.id ? "You" : `Player ${i + 1}`,
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
          canSettle:
            (game.players.find((p) => p.id === actingPlayerId)?.cash ?? 0) >= debt.amount,
          onSettle: () => dispatch({ type: "SettleDebt", playerId: actingPlayerId }),
          onDeclareBankruptcy: () =>
            dispatch({ type: "DeclareBankruptcy", playerId: actingPlayerId }),
        }
      : null;

  return (
    <>
      {/* Two-column on desktop (board left, all info/controls right); a single
          stacked column on phones — identical to the offline layout. */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:gap-4 lg:p-4">
        <div className="w-full lg:w-[68%] lg:shrink-0">
          <Board
            game={game}
            players={displaySetups}
            events={recentEvents}
            onSelectTile={setInspectPosition}
            onSelectEmblem={() => setEventTablesOpen(true)}
          />
        </div>

        <div className="flex w-full min-h-0 flex-col lg:w-[32%]">
          <PlayerStrip game={game} players={displaySetups} events={recentEvents} />

          {lastError && (
            <p className="px-4 py-2 text-center text-caption text-semantic-error">{lastError}</p>
          )}

          <ActionDock
            game={game}
            actingPlayerId={actingPlayerId}
            isActingPlayerLocal={isActingPlayerLocal}
            onOpenProperties={() => setPropertiesOpen(true)}
            onOpenTrade={() => setTradeOpen(true)}
            tradeBadge={tradeBadge}
            debtPrompt={debtPrompt}
            dispatch={dispatch}
          />

          <GameLog events={eventLog} players={displaySetups} />
        </div>
      </div>

      <DiceCeremony events={recentEvents} />
      {!walking && (
        <BuyPropertySheet
          game={game}
          actingPlayerId={actingPlayerId}
          isActingPlayerLocal={isActingPlayerLocal}
          dispatch={dispatch}
        />
      )}
      <AuctionSheet
        game={game}
        actingPlayerId={actingPlayerId}
        isActingPlayerLocal={isActingPlayerLocal}
        dispatch={dispatch}
      />
      <PropertiesSheet
        game={game}
        actingPlayerId={actingPlayerId}
        open={propertiesOpen}
        onClose={() => setPropertiesOpen(false)}
        dispatch={dispatch}
      />
      <TileDetailSheet
        game={game}
        players={displaySetups}
        position={inspectPosition}
        onClose={() => setInspectPosition(null)}
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
        />
      )}
      <VictoryDialog
        game={game}
        players={displaySetups}
        mode="online"
        onPlayAgain={() => navigate("/")}
      />
    </>
  );
}
