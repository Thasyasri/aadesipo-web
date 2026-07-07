import type { GameEvent } from "@aadesipo/engine";
import { DieFace } from "./DieFace";

/**
 * A small, always-visible reminder of the most recent dice roll, so a player
 * can see what they (or the last player) rolled without opening the activity
 * feed. Reads the full event log and shows the latest DiceRolled.
 */
export function LastRoll({ events }: { events: readonly GameEvent[] }) {
  let roll: { die1: number; die2: number } | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e?.type === "DiceRolled") {
      roll = { die1: e.die1, die2: e.die2 };
      break;
    }
  }
  if (!roll) return null;

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-2 text-caption text-text-secondary">
      <span className="uppercase tracking-wide">Last roll</span>
      <DieFace value={roll.die1} size={26} />
      <DieFace value={roll.die2} size={26} />
      <span className="font-semibold text-text-primary">= {roll.die1 + roll.die2}</span>
    </div>
  );
}
