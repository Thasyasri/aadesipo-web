import type { GameResult } from "@/services/db";
import type { PlayerStats } from "@/services/stats";
import { formatRupees } from "@/utils/currency";

const MODE_LABEL: Record<GameResult["mode"], string> = {
  classic: "Classic",
  quick: "Quick",
  marathon: "Marathon",
};

/** Four headline numbers, used on both the Profile and the Dashboard. */
export function StatStrip({ stats }: { stats: PlayerStats }) {
  const items = [
    { label: "Games", value: String(stats.games) },
    { label: "Win rate", value: `${Math.round(stats.winRate * 100)}%` },
    { label: "Best net worth", value: formatRupees(stats.bestNetWorth) },
    {
      label: "Streak",
      value: stats.currentStreak > 0 ? `${stats.currentStreak} 🔥` : "—",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="rounded-md bg-bg-base p-3 text-center">
          <div className="font-display text-heading tabular-nums text-brand-primary-strong">
            {it.value}
          </div>
          <div className="mt-0.5 text-caption text-text-secondary">{it.label}</div>
        </div>
      ))}
    </div>
  );
}

/** A compact win/loss trail — oldest → newest, left to right. */
export function TrendDots({ recent }: { recent: readonly GameResult[] }) {
  const dots = [...recent].slice(0, 14).reverse();
  if (dots.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-caption text-text-secondary">Recent form</span>
      <div className="flex gap-1">
        {dots.map((r) => (
          <span
            key={r.id}
            title={r.won ? "Win" : "Loss"}
            className={`h-2.5 w-2.5 rounded-full ${r.won ? "bg-semantic-success" : "bg-bg-raised"}`}
          />
        ))}
      </div>
    </div>
  );
}

/** The cities a player owns most often across their games. */
export function FavouriteCities({ stats }: { stats: PlayerStats }) {
  if (stats.favouriteCities.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-caption text-text-secondary">Favourite cities</span>
      {stats.favouriteCities.map((c) => (
        <span
          key={c.name}
          className="rounded-pill bg-bg-raised px-3 py-1 text-caption text-text-primary"
        >
          {c.name} <span className="text-text-secondary">×{c.count}</span>
        </span>
      ))}
    </div>
  );
}

/** One finished game, for the recent-results list. */
export function ResultRow({ r }: { r: GameResult }) {
  return (
    <div className="flex items-center justify-between border-b border-bg-raised py-2.5 text-body last:border-0">
      <span className="flex items-center gap-2">
        <span
          className={`rounded-pill px-2 py-0.5 text-caption font-semibold ${
            r.won ? "bg-semantic-success text-[#0b1f16]" : "bg-bg-raised text-text-secondary"
          }`}
        >
          {r.won ? "Won" : "Lost"}
        </span>
        <span className="text-text-primary">{MODE_LABEL[r.mode]}</span>
        <span className="text-caption text-text-secondary">
          {r.source === "online" ? "Online" : "vs AI"} · {r.playerCount} players
        </span>
      </span>
      <span className="tabular-nums text-text-secondary">{formatRupees(r.netWorth)}</span>
    </div>
  );
}
