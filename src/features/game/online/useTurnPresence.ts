import { useCallback, useEffect, useRef, useState } from "react";
import { advanceStalledTurn, fetchPresence, heartbeatPresence } from "@/multiplayer/onlineClient";

/** Announce ourselves this often. Well under STALL_THRESHOLD_MS on the server,
 *  so a live player is never mistaken for an absent one. */
const HEARTBEAT_MS = 20_000;
/** How often we look at everyone else. Only runs when we're waiting on someone. */
const POLL_MS = 15_000;
/** Match advance-turn's STALL_THRESHOLD_MS. Ours only decides when to OFFER the
 *  takeover — the server re-checks against its own clock before acting, so
 *  clock skew here can produce a useless button, never a skipped turn. */
const STALL_AFTER_MS = 60_000;
/** A player with no presence row hasn't necessarily left: they may just be
 *  loading. Time them from when WE started waiting, and wait longer. Mirrors
 *  advance-turn's NEVER_SEEN_GRACE_MS. */
const NEVER_SEEN_GRACE_MS = 180_000;

interface TurnPresence {
  /** True when the acting player has gone quiet long enough to take over. */
  stalled: boolean;
  /** Seconds the acting player has been unseen; null while they're present. */
  idleSeconds: number | null;
  takeOver: () => void;
  takingOver: boolean;
  error: string | null;
}

/** What we know about the acting player's presence right now. `sinceMs` is how
 *  long they've been quiet; `everSeen` says whether that number came from a real
 *  heartbeat or merely from how long we've been waiting. */
interface Idle {
  sinceMs: number;
  everSeen: boolean;
}

/**
 * Keeps this client's presence fresh, and watches the acting player's.
 *
 * Nobody but the acting player can act — the engine says so — which means a
 * closed tab on their turn deadlocks the room for everyone. When they've been
 * gone a full minute, any other player may ask the server to play their turn.
 *
 * @param roomId  Null while connecting; the hook idles.
 * @param actingPlayerId  Empty string once the game is over.
 * @param isMyTurn  We never watch ourselves, and never poll on our own turn.
 */
export function useTurnPresence(
  roomId: string | null,
  gameId: string | null,
  actingPlayerId: string,
  isMyTurn: boolean,
): TurnPresence {
  const [idle, setIdle] = useState<Idle | null>(null);
  const [takingOver, setTakingOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** When this player's turn started, as far as this client can tell. Used as
   *  the clock for someone who has never sent a heartbeat. */
  const watchingSince = useRef(Date.now());

  // Heartbeat, for as long as we're on this screen.
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    const beat = () => {
      if (!cancelled) void heartbeatPresence(roomId).catch(() => {});
    };
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [roomId]);

  // Watch whoever we're waiting on. Nothing to watch on our own turn, or after
  // the game ends (actingPlayerId is empty then).
  const watching = roomId !== null && actingPlayerId !== "" && !isMyTurn;
  useEffect(() => {
    if (!watching || !roomId) {
      setIdle(null);
      return;
    }
    let cancelled = false;
    const check = async () => {
      try {
        const seen = await fetchPresence(roomId);
        if (cancelled) return;
        const lastSeen = seen[actingPlayerId];
        setIdle(
          lastSeen === undefined
            ? // No heartbeat ever. They might be mid-load rather than gone, so
              // time them from when their turn started, not from the epoch.
              { sinceMs: Date.now() - watchingSince.current, everSeen: false }
            : { sinceMs: Date.now() - lastSeen, everSeen: true },
        );
      } catch {
        // A failed poll just means we don't offer the takeover this round.
      }
    };
    void check();
    const timer = setInterval(() => void check(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [watching, roomId, actingPlayerId]);

  // Reset the moment the turn moves on, so a fresh acting player never inherits
  // the previous one's idle time — nor their head start on the never-seen clock.
  const lastActing = useRef(actingPlayerId);
  if (lastActing.current !== actingPlayerId) {
    lastActing.current = actingPlayerId;
    watchingSince.current = Date.now();
    if (idle !== null) setIdle(null);
    if (error !== null) setError(null);
  }

  const takeOver = useCallback(() => {
    if (!gameId || takingOver) return;
    setTakingOver(true);
    setError(null);
    void advanceStalledTurn(gameId)
      .then(() => setIdle(null))
      .catch((err: Error) => setError(err.message))
      .finally(() => setTakingOver(false));
  }, [gameId, takingOver]);

  const threshold = idle?.everSeen ? STALL_AFTER_MS : NEVER_SEEN_GRACE_MS;
  const stalled = watching && idle !== null && idle.sinceMs >= threshold;

  return {
    stalled,
    idleSeconds: idle === null ? null : Math.round(idle.sinceMs / 1000),
    takeOver,
    takingOver,
    error,
  };
}
