import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { GameEvent, GameState } from "@aadesipo/engine";
import { getActingPlayerId } from "@aadesipo/engine";
import { PLAYER_COLORS } from "@/theme/tokens";
import type { PlayerSetup } from "@/state/gameStore";
import { formatRupees } from "@/utils/currency";
import { computeCashDeltas } from "./cashDeltas";

interface PlayerStripProps {
  game: GameState;
  players: readonly PlayerSetup[];
  events: readonly GameEvent[];
}

export function PlayerStrip({ game, players, events }: PlayerStripProps) {
  const actingId = game.turnPhase === "game-over" ? null : getActingPlayerId(game);

  const [floatingDeltas, setFloatingDeltas] = useState<Record<string, number>>({});
  const lastEvents = useRef(events);

  useEffect(() => {
    if (events === lastEvents.current) return;
    lastEvents.current = events;
    const deltas = computeCashDeltas(events);
    if (Object.keys(deltas).length === 0) return;

    setFloatingDeltas(deltas);
    const t = setTimeout(() => setFloatingDeltas({}), 1100);
    return () => clearTimeout(t);
  }, [events]);

  return (
    <div className="flex gap-2 overflow-x-auto p-3">
      {game.players.map((p, i) => {
        const setup = players.find((ps) => ps.id === p.id);
        const isActing = p.id === actingId;
        const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
        const delta = floatingDeltas[p.id];

        return (
          <div
            key={p.id}
            className={`relative flex min-w-[104px] flex-col gap-1 rounded-md border px-3 py-2 transition-colors ${
              isActing ? "border-brand-primary bg-bg-raised" : "border-transparent bg-bg-surface"
            } ${p.isBankrupt ? "opacity-40" : ""}`}
          >
            <AnimatePresence>
              {delta !== undefined && delta !== 0 && (
                <motion.span
                  key={`${p.id}-${delta}-${events.length}`}
                  initial={{ opacity: 0, y: 0 }}
                  animate={{ opacity: 1, y: -24 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1 }}
                  className={`pointer-events-none absolute -top-1 right-2 text-caption font-bold tabular-nums ${
                    delta > 0 ? "text-semantic-success" : "text-semantic-error"
                  }`}
                >
                  {delta > 0 ? "+" : ""}
                  {formatRupees(delta)}
                </motion.span>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
                aria-hidden="true"
              />
              <span className="truncate text-caption font-semibold text-text-primary">
                {setup?.displayName ?? p.id}
                {setup?.ai ? " 🤖" : ""}
              </span>
            </div>
            <span className="font-display text-body-lg tabular-nums text-text-primary">
              {formatRupees(p.cash)}
            </span>
            {p.inJail && <span className="text-micro text-semantic-warn">In jail</span>}
            {p.isBankrupt && <span className="text-micro text-semantic-error">Bankrupt</span>}
          </div>
        );
      })}
    </div>
  );
}
