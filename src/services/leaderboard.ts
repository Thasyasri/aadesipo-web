import { supabase } from "./supabase";

export type LeaderboardMode = "classic" | "quick" | "marathon" | null;

export interface LeaderboardRow {
  displayName: string;
  wins: number;
  games: number;
  winRate: number; // 0..1
  isYou: boolean;
}

interface RawRow {
  display_name: string;
  wins: number;
  games: number;
  win_rate: number;
  is_you: boolean;
}

/**
 * Fetch the public leaderboard (online-validated games only; see D4) via the
 * security-definer `leaderboard` RPC. Rows come pre-ranked; the caller numbers
 * them. Returns [] when Supabase isn't configured or on any error.
 */
export async function fetchLeaderboard(
  mode: LeaderboardMode,
  since: Date | null,
): Promise<LeaderboardRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("leaderboard", {
    p_mode: mode,
    p_since: since ? since.toISOString() : null,
  });
  if (error || !data) return [];
  return (data as RawRow[]).map((r) => ({
    displayName: r.display_name,
    wins: Number(r.wins),
    games: Number(r.games),
    winRate: Number(r.win_rate),
    isYou: Boolean(r.is_you),
  }));
}
