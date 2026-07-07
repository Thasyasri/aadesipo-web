import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { getActingPlayerId } from "@aadesipo/engine";
import { useGameView } from "@/state/gameStore";
import { useAiTurnDriver } from "./useAiTurnDriver";
import { Board, WALK_STEP_CAP, WALK_START_DELAY_MS, APPROX_MS_PER_TILE } from "./board/Board";
import { PlayerStrip } from "./hud/PlayerStrip";
import { ActionDock } from "./hud/ActionDock";
import { BuyPropertySheet } from "./sheets/BuyPropertySheet";
import { AuctionSheet } from "./sheets/AuctionSheet";
import { PropertiesSheet } from "./sheets/PropertiesSheet";
import { TileDetailSheet } from "./sheets/TileDetailSheet";
import { EventTablesSheet } from "./sheets/EventTablesSheet";
import { TradeSheet } from "./sheets/TradeSheet";
import { ActivitySounds } from "./GameLog";
import { ActivitySheet } from "./sheets/ActivitySheet";
import { LastRoll } from "./dice/LastRoll";
import { VictoryDialog } from "./VictoryDialog";
import { DiceCeremony } from "./dice/DiceCeremony";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";

export function GameScreen() {
  const { gameId: routeGameId } = useParams<{ gameId: string }>();
  const gameId = useGameView((s) => s.gameId);
  const game = useGameView((s) => s.game);
  const players = useGameView((s) => s.players);
  const isPassAndPlay = useGameView((s) => s.isPassAndPlay);
  const recentEvents = useGameView((s) => s.recentEvents);
  const eventLog = useGameView((s) => s.eventLog);
  const lastError = useGameView((s) => s.lastError);
  const startGame = useGameView((s) => s.startGame);
  const resumeGame = useGameView((s) => s.resumeGame);
  const dispatch = useGameView((s) => s.dispatch);
  const undo = useGameView((s) => s.undo);
  const lastAction = useGameView((s) => s.lastAction);
  const navigate = useNavigate();

  const [resumeAttempted, setResumeAttempted] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [inspectPosition, setInspectPosition] = useState<number | null>(null);
  const [eventTablesOpen, setEventTablesOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  // While the token is walking its tiles after a roll, hold back the landing
  // (buy) sheet so it doesn't cover the board — the coin arrives first, then
  // you decide.
  const [walking, setWalking] = useState(false);
  const attemptedFor = useRef<string | null>(null);

  useAiTurnDriver();

  // Suppress the landing sheet for roughly as long as the token's walk takes.
  useEffect(() => {
    const hasRoll = recentEvents.some((e) => e.type === "DiceRolled");
    const tiles = recentEvents.reduce((sum, e) => {
      if (e.type === "PlayerMoved") {
        const n = Math.abs(e.steps);
        return sum + (n > WALK_STEP_CAP ? 1 : n); // long jumps glide (1 hop)
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
    if (!routeGameId || routeGameId === gameId) return;
    if (attemptedFor.current === routeGameId) return;
    attemptedFor.current = routeGameId;
    void resumeGame(routeGameId).finally(() => setResumeAttempted(true));
  }, [routeGameId, gameId, resumeGame]);

  const stillResuming = routeGameId !== undefined && routeGameId !== gameId && !resumeAttempted;

  if (stillResuming) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Card>
          <p className="text-body text-text-secondary">Resuming your game…</p>
        </Card>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Card>
          <p className="mb-4 text-body text-text-secondary">
            No game in progress — start one from the home screen.
          </p>
          <Button variant="primary" onClick={() => navigate("/play")}>
            Back to home
          </Button>
        </Card>
      </div>
    );
  }

  const actingPlayerId = game.turnPhase === "game-over" ? "" : getActingPlayerId(game);
  const actingSetup = players.find((p) => p.id === actingPlayerId);
  const isActingPlayerLocal = actingSetup !== undefined && !actingSetup.ai;

  // The local human who drives the trade UI: whoever's turn it is in Pass &
  // Play (everyone is local), or the single human in Vs. AI (so they can
  // propose/answer trades even while an AI is taking its turn).
  const localHumanId =
    game.turnPhase === "game-over"
      ? null
      : isPassAndPlay
        ? actingPlayerId || null
        : (players.find((p) => p.ai === undefined)?.id ?? null);
  // A pending trade needs a local human's answer whenever its recipient is a
  // local player — independent of whose turn it is.
  const pendingRecipientId = game.pendingTrade?.recipientId;
  const tradeBadge =
    pendingRecipientId !== undefined &&
    players.find((p) => p.id === pendingRecipientId)?.ai === undefined;

  // The local acting player owes more than their cash — surface the raise-
  // funds prompt in the action dock.
  const debt = game.pendingDebt;
  const debtPrompt =
    debt && debt.debtorId === actingPlayerId && isActingPlayerLocal
      ? {
          amount: debt.amount,
          creditorName: debt.creditorId
            ? (players.find((p) => p.id === debt.creditorId)?.displayName ?? debt.creditorId)
            : "the bank",
          canSettle: (game.players.find((p) => p.id === actingPlayerId)?.cash ?? 0) >= debt.amount,
          onSettle: () => dispatch({ type: "SettleDebt", playerId: actingPlayerId }),
          onDeclareBankruptcy: () =>
            dispatch({ type: "DeclareBankruptcy", playerId: actingPlayerId }),
        }
      : null;

  const handlePlayAgain = () => {
    const newGameId = crypto.randomUUID();
    // Replay under the same mode and house rules as the finished game.
    void startGame(newGameId, players, isPassAndPlay, {
      houseRules: game.houseRules,
      mode: game.mode,
    }).then(() => {
      navigate(`/game/${newGameId}`);
    });
  };

  // A one-step take-back for local play: available while there's an undoable
  // last action (not a dice roll — that would let you re-fish the result).
  const canUndo =
    isPassAndPlay &&
    lastAction !== null &&
    lastAction.type !== "RollDice" &&
    game.turnPhase !== "game-over";

  return (
    <>
      {/* Two-column from tablets up (board left, all info/controls right); a
          single stacked column on phones (board first, everything below it).
          Engaging at md keeps a portrait tablet's controls beside the board
          rather than a full screen-height scroll below it. */}
      <div className="flex flex-col md:flex-row md:items-start md:gap-4 md:p-4">
        {/* Board side — nothing but the board. */}
        <div className="w-full md:w-[68%] md:shrink-0">
          <Board
            game={game}
            players={players}
            events={recentEvents}
            onSelectTile={setInspectPosition}
            onSelectEmblem={() => setEventTablesOpen(true)}
          />
        </div>

        {/* Side panel — every piece of game info and control. The activity
            log scrolls internally so the strip and actions stay pinned. */}
        <div className="flex w-full min-h-0 flex-col md:w-[32%]">
          <PlayerStrip game={game} players={players} events={recentEvents} />

          <LastRoll events={eventLog} />

          {lastError && (
            <p className="px-4 py-2 text-center text-caption text-semantic-error">{lastError}</p>
          )}

          <ActionDock
            game={game}
            actingPlayerId={actingPlayerId}
            isActingPlayerLocal={isActingPlayerLocal}
            onOpenProperties={() => setPropertiesOpen(true)}
            onOpenActivity={() => setActivityOpen(true)}
            onOpenTrade={() => setTradeOpen(true)}
            tradeBadge={tradeBadge}
            debtPrompt={debtPrompt}
            canUndo={canUndo}
            onUndo={() => void undo()}
            dispatch={dispatch}
          />
        </div>
      </div>

      {/* Sounds fire even while the activity list is closed. */}
      <ActivitySounds events={eventLog} />
      <ActivitySheet
        events={eventLog}
        players={players}
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
      />

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
        players={players}
        actingPlayerId={actingPlayerId}
        isActingPlayerLocal={isActingPlayerLocal}
        dispatch={dispatch}
        onInspect={setInspectPosition}
      />
      <PropertiesSheet
        game={game}
        actingPlayerId={actingPlayerId}
        open={propertiesOpen}
        onClose={() => setPropertiesOpen(false)}
        dispatch={dispatch}
        onInspect={setInspectPosition}
      />
      <EventTablesSheet open={eventTablesOpen} onClose={() => setEventTablesOpen(false)} />
      {localHumanId && (
        <TradeSheet
          game={game}
          players={players}
          currentPlayerId={localHumanId}
          localPlayerIds={players.filter((p) => p.ai === undefined).map((p) => p.id)}
          eventLog={eventLog}
          open={tradeOpen}
          onClose={() => setTradeOpen(false)}
          dispatch={dispatch}
          onInspect={setInspectPosition}
        />
      )}
      {/* Rendered last so its portal layers on top of the Properties/Trade
          sheets when a name is tapped for inspection. */}
      <TileDetailSheet
        game={game}
        players={players}
        position={inspectPosition}
        onClose={() => setInspectPosition(null)}
      />
      <VictoryDialog
        game={game}
        players={players}
        mode={isPassAndPlay ? "pass-and-play" : "vs-ai"}
        onPlayAgain={handlePlayAgain}
      />
    </>
  );
}
