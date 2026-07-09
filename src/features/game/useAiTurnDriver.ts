import { useEffect, useRef } from "react";
import {
  chooseAiAction,
  decideTradeResponse,
  decideTradeProposal,
  getActingPlayerId,
} from "@aadesipo/engine";
import { useGameView } from "@/state/gameStore";

const MIN_THINK_MS = 600;
const MAX_THINK_MS = 1500;

/** A UI-only "thinking" pause so AI actions don't feel instant/robotic. Uses
 *  Math.random deliberately — it touches nothing about game state or the AI's
 *  seeded decision, so it never affects determinism or replay. */
function thinkTime(): number {
  return MIN_THINK_MS + Math.random() * (MAX_THINK_MS - MIN_THINK_MS);
}

/**
 * @param blocked True while a pawn is still walking the board. The AI must not
 *   think, decide, or dispatch until the current move has fully played out —
 *   otherwise its actions (and its activity-log lines) appear while the
 *   previous player's token is still mid-walk.
 */
export function useAiTurnDriver(blocked = false): void {
  const game = useGameView((s) => s.game);
  const players = useGameView((s) => s.players);
  const aiRng = useGameView((s) => s.aiRng);
  const isActingPlayerAi = useGameView((s) => s.isActingPlayerAi);
  const actingAiConfig = useGameView((s) => s.actingAiConfig);
  const dispatch = useGameView((s) => s.dispatch);
  const setAiRng = useGameView((s) => s.setAiRng);

  // The turn we've already floated a trade offer on (`round:playerIndex`), so
  // the AI proposes at most once per turn — otherwise a rejected offer would be
  // re-proposed on the very next tick and loop forever.
  const proposedTurnRef = useRef<string | null>(null);

  useEffect(() => {
    if (!game || game.turnPhase === "game-over") return;
    // Strict sequencing: wait for the board to settle. When `blocked` flips this
    // effect re-runs, so a timer scheduled a frame before the walk began gets
    // cleared by the cleanup below, and re-scheduled once the walk finishes.
    if (blocked) return;

    // An AI has an incoming trade to answer — respond after a brief pause,
    // regardless of whose turn it currently is (matching the pace of its
    // normal actions). This runs before the turn check below.
    const pending = game.pendingTrade;
    if (pending) {
      const recipient = players.find((p) => p.id === pending.recipientId);
      if (recipient?.ai) {
        const config = recipient.ai;
        const timer = setTimeout(() => {
          const action = decideTradeResponse(game, pending.recipientId, config);
          if (action) dispatch(action);
        }, thinkTime());
        return () => clearTimeout(timer);
      }
    }

    // Otherwise, drive the acting AI's normal turn.
    if (!isActingPlayerAi()) return;
    const config = actingAiConfig();
    if (!config) return;

    const timer = setTimeout(() => {
      const { action, nextRng } = chooseAiAction(game, config, aiRng);

      // When the AI would just end its turn, occasionally float a trade offer
      // first — a cash bid to finish one of its color groups. Gated to once per
      // turn (the ref) and never while a trade is already pending.
      if (action.type === "EndTurn" && !game.pendingTrade) {
        const turnKey = `${game.roundNumber}:${game.currentPlayerIndex}`;
        const proposeChance = 0.25 + config.personality.tradeFriendliness * 0.4;
        if (proposedTurnRef.current !== turnKey && Math.random() < proposeChance) {
          proposedTurnRef.current = turnKey;
          const proposal = decideTradeProposal(game, getActingPlayerId(game), config);
          if (proposal) {
            dispatch(proposal);
            return;
          }
        }
      }

      setAiRng(nextRng);
      dispatch(action);
    }, thinkTime());

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, blocked]);
}
