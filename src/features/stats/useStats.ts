import { useEffect, useState } from "react";
import { listGameResults, type GameResult } from "@/services/db";
import { computeStats, type PlayerStats } from "@/services/stats";

/**
 * Loads this device's finished-game results and derives personal stats. Local
 * source of truth (guests included); a signed-in player's results are also in
 * Supabase, but the local mirror is always complete for the current device.
 */
export function useStats(): { stats: PlayerStats | null; results: GameResult[]; loading: boolean } {
  const [results, setResults] = useState<GameResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void listGameResults().then((r) => {
      if (cancelled) return;
      setResults(r);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { stats: loading ? null : computeStats(results), results, loading };
}
