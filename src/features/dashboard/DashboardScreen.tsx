import { Link } from "react-router";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useSession } from "@/state/session";
import { ResumeGamesList } from "@/features/home/ResumeGamesList";
import { useStats } from "@/features/stats/useStats";
import { StatStrip, TrendDots, FavouriteCities, ResultRow } from "@/features/stats/StatViews";

/** The returning-player home: resume in-progress games, see your stats and
 *  trends, and your recent results. Works for guests (local) and signed-in
 *  players (local + synced). */
export function DashboardScreen() {
  const { profile } = useSession();
  const { stats, loading } = useStats();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-title">
          Welcome back{profile?.displayName ? `, ${profile.displayName}` : ""}.
        </h1>
        <Link to="/play">
          <Button variant="primary">New game</Button>
        </Link>
      </div>

      <ResumeGamesList />

      <Card>
        <h2 className="mb-4 font-display text-heading">Your play</h2>
        {loading ? (
          <p className="text-body text-text-secondary">Loading…</p>
        ) : stats && stats.games > 0 ? (
          <div className="flex flex-col gap-4">
            <StatStrip stats={stats} />
            <TrendDots recent={stats.recent} />
            <FavouriteCities stats={stats} />
          </div>
        ) : (
          <p className="text-body text-text-secondary">
            Play a few games — vs AI or online — and your stats will appear here.
          </p>
        )}
      </Card>

      {stats && stats.recent.length > 0 && (
        <Card>
          <h2 className="mb-2 font-display text-heading">Recent results</h2>
          <div className="flex flex-col">
            {stats.recent.slice(0, 8).map((r) => (
              <ResultRow key={r.id} r={r} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
