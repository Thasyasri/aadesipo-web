import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import type { GameState } from "@aadesipo/engine";
import { netWorth } from "@aadesipo/engine";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/Button";
import type { PlayerSetup } from "@/state/gameStore";
import { downloadShareCard, generateShareCard } from "./shareCard";
import { analyticsEvents } from "@/services/analytics";
import { recordGameResult } from "@/services/stats";
import { useMotionPrefs } from "@/theme/motion";
import { formatRupees } from "@/utils/currency";

interface VictoryDialogProps {
  gameId: string | null;
  game: GameState;
  players: readonly PlayerSetup[];
  mode: "vs-ai" | "pass-and-play" | "online";
  /** The local player whose result to record for stats — the human in a vs-AI
   *  game, your seat online, or null for pass-and-play (no single "you"). */
  localPlayerId?: string | null;
  onPlayAgain: () => void;
}

export function VictoryDialog({
  gameId,
  game,
  players,
  mode,
  localPlayerId,
  onPlayAgain,
}: VictoryDialogProps) {
  const isOver = game.turnPhase === "game-over" && game.winnerId !== null;
  // Dismissing the dialog (Escape / backdrop) must NOT start a new game — it
  // just tucks it away so the player can study the final board. "Play again" is
  // the only thing that starts one. `open` is derived from game state, so this
  // local flag is what actually hides it.
  const [dismissed, setDismissed] = useState(false);
  const open = isOver && !dismissed;
  const [shareCardUrl, setShareCardUrl] = useState<string | null>(null);
  // Report once PER GAME, not once per mount: "Play again" navigates to a new
  // game id without remounting this component, so a boolean ref would silently
  // skip recording every game after the first.
  const reportedFor = useRef<string | null>(null);
  const { reduceMotion } = useMotionPrefs();

  // A fresh game (or an undo back into play) re-arms the dialog.
  useEffect(() => {
    if (!isOver) setDismissed(false);
  }, [isOver]);

  useEffect(() => {
    if (!isOver) return;
    if (!reduceMotion) {
      void confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
    }
    setShareCardUrl(generateShareCard(game, players));

    if (gameId && reportedFor.current !== gameId) {
      reportedFor.current = gameId;
      const reason =
        game.players.filter((p) => !p.isBankrupt).length === 1
          ? "last-player-standing"
          : "net-worth-at-cap";
      analyticsEvents.gameCompleted(mode, reason, game.players.length);
      // Record a personal result where there's a single clear "you" (vs-AI or
      // online). Pass-and-play is a shared device, so it's skipped.
      if (localPlayerId && (mode === "vs-ai" || mode === "online")) {
        void recordGameResult({ gameId, game, source: mode, localPlayerId });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOver, gameId]);

  if (!open || !game.winnerId) return null;

  const winnerSetup = players.find((p) => p.id === game.winnerId);
  const ranked = [...game.players].sort((a, b) => netWorth(game, b.id) - netWorth(game, a.id));

  return (
    <Dialog open={open} onClose={() => setDismissed(true)} title="Game over!">
      <p className="mb-4 text-body-lg font-semibold text-brand-primary-strong">
        {winnerSetup?.displayName ?? game.winnerId} wins! 🎉
      </p>

      {shareCardUrl && (
        <img
          src={shareCardUrl}
          alt="Victory share card"
          className="mb-4 w-full rounded-md shadow-[var(--shadow-e2)]"
        />
      )}

      <div className="mb-6 flex flex-col gap-2">
        {ranked.map((p, i) => {
          const setup = players.find((ps) => ps.id === p.id);
          return (
            <div key={p.id} className="flex items-center justify-between text-body">
              <span className="text-text-secondary">
                #{i + 1} {setup?.displayName ?? p.id}
              </span>
              <span className="tabular-nums text-text-primary">
                {formatRupees(netWorth(game, p.id))}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        {shareCardUrl && (
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => downloadShareCard(shareCardUrl)}
          >
            Download share card
          </Button>
        )}
        <Button variant="primary" className="flex-1" onClick={onPlayAgain}>
          Play again
        </Button>
      </div>
    </Dialog>
  );
}
