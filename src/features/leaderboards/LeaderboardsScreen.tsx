import { useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { UnconfiguredBanner } from "@/components/UnconfiguredBanner";
import { isSupabaseConfigured } from "@/services/supabase";
import {
  fetchLeaderboard,
  type LeaderboardMode,
  type LeaderboardRow,
} from "@/services/leaderboard";

const MODE_TABS: { key: LeaderboardMode; label: string }[] = [
  { key: null, label: "Overall" },
  { key: "classic", label: "Classic" },
  { key: "quick", label: "Quick" },
  { key: "marathon", label: "Marathon" },
];
type TimeWindow = "all" | "30d";

const pillClass = (on: boolean) =>
  `rounded-pill px-3 py-1.5 text-caption font-semibold transition-colors ${
    on ? "bg-brand-primary text-[#1A1200]" : "text-text-secondary"
  }`;

export function LeaderboardsScreen() {
  const [mode, setMode] = useState<LeaderboardMode>(null);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("all");
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const since = timeWindow === "30d" ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) : null;
    void fetchLeaderboard(mode, since).then((r) => {
      if (cancelled) return;
      setRows(r);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, timeWindow]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      {!isSupabaseConfigured && <UnconfiguredBanner />}

      <div>
        <h1 className="font-display text-title">Leaderboards</h1>
        <p className="mt-1 text-caption text-text-secondary">
          Ranked from <b className="text-text-primary">online games only</b> — the ones the server
          validates move by move. Opt in from your Profile to appear.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-pill bg-bg-surface p-1">
          {MODE_TABS.map((t) => (
            <button
              key={t.label}
              type="button"
              aria-pressed={mode === t.key}
              onClick={() => setMode(t.key)}
              className={pillClass(mode === t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-pill bg-bg-surface p-1">
          {(["all", "30d"] as const).map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={timeWindow === w}
              onClick={() => setTimeWindow(w)}
              className={pillClass(timeWindow === w)}
            >
              {w === "all" ? "All-time" : "Last 30 days"}
            </button>
          ))}
        </div>
      </div>

      <Card>
        {loading ? (
          <p className="text-body text-text-secondary">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-body text-text-secondary">
            No ranked players yet. Leaderboards fill up as people play{" "}
            <b className="text-text-primary">online</b> games — a minimum of 5 to appear. Play a few
            online rooms and check back.
          </p>
        ) : (
          <div className="flex flex-col">
            <div className="flex items-center gap-3 border-b border-bg-raised pb-2 text-caption uppercase tracking-wide text-text-secondary">
              <span className="w-8">#</span>
              <span className="flex-1">Player</span>
              <span className="w-14 text-right">Wins</span>
              <span className="w-14 text-right">Win%</span>
              <span className="w-16 text-right">Games</span>
            </div>
            {rows.map((r, i) => (
              <div
                key={`${r.displayName}-${i}`}
                className={`flex items-center gap-3 border-b border-bg-raised py-2.5 text-body last:border-0 ${
                  r.isYou ? "font-semibold text-brand-primary-strong" : ""
                }`}
              >
                <span className="w-8 tabular-nums text-text-secondary">{i + 1}</span>
                <span className="flex-1 truncate">
                  {r.displayName}
                  {r.isYou && " (you)"}
                </span>
                <span className="w-14 text-right tabular-nums">{r.wins}</span>
                <span className="w-14 text-right tabular-nums">{Math.round(r.winRate * 100)}%</span>
                <span className="w-16 text-right tabular-nums text-text-secondary">{r.games}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
