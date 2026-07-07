import type { GameEvent } from "@aadesipo/engine";
import { BottomSheet } from "@/components/BottomSheet";
import { GameLog } from "../GameLog";
import type { PlayerSetup } from "@/state/gameStore";

interface ActivitySheetProps {
  events: readonly GameEvent[];
  players: readonly PlayerSetup[];
  open: boolean;
  onClose: () => void;
}

/**
 * The full move-by-move activity feed, opened from the Activity button so it
 * stays off the main screen until wanted. The sheet body scrolls the history.
 */
export function ActivitySheet({ events, players, open, onClose }: ActivitySheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <h2 className="mb-1 font-display text-title">Activity</h2>
      <p className="mb-4 text-caption text-text-secondary">Every move, newest first.</p>
      <GameLog events={events} players={players} />
    </BottomSheet>
  );
}
