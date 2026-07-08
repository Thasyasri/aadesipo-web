import { describe, expect, it } from "vitest";
import { computeStats } from "./stats";
import type { GameResult } from "./db";

function res(over: Partial<GameResult> & { id: string }): GameResult {
  return {
    finishedAt: 0,
    mode: "classic",
    source: "vs-ai",
    playerCount: 2,
    won: false,
    reason: "net-worth-at-cap",
    netWorth: 0,
    rank: 2,
    rounds: 10,
    cities: [],
    synced: false,
    ...over,
  };
}

describe("computeStats", () => {
  // Newest-first, as listGameResults returns.
  const results: GameResult[] = [
    res({
      id: "a",
      won: true,
      mode: "quick",
      netWorth: 500,
      cities: ["Charminar"],
      source: "online",
    }),
    res({ id: "b", won: true, netWorth: 1200, cities: ["Charminar", "Vizag"] }),
    res({ id: "c", won: false, netWorth: 300, cities: ["Vizag"] }),
    res({ id: "d", won: true, netWorth: 800, cities: ["Charminar"] }),
  ];

  it("counts games, wins, and win rate", () => {
    const s = computeStats(results);
    expect(s.games).toBe(4);
    expect(s.wins).toBe(3);
    expect(s.winRate).toBeCloseTo(0.75);
  });

  it("splits wins/games by mode", () => {
    const s = computeStats(results);
    expect(s.byMode.classic).toEqual({ games: 3, wins: 2 });
    expect(s.byMode.quick).toEqual({ games: 1, wins: 1 });
    expect(s.byMode.marathon).toEqual({ games: 0, wins: 0 });
  });

  it("takes the peak final net worth", () => {
    expect(computeStats(results).bestNetWorth).toBe(1200);
  });

  it("computes the current streak from the newest game and the best streak overall", () => {
    // newest-first won flags: a W, b W, c L, d W  → current run = 2 (a,b).
    // chronological (d,c,b,a): W L W W → best run = 2 (b,a).
    const s = computeStats(results);
    expect(s.currentStreak).toBe(2);
    expect(s.bestStreak).toBe(2);
  });

  it("ranks favourite cities by how often they're owned", () => {
    const s = computeStats(results);
    expect(s.favouriteCities[0]).toEqual({ name: "Charminar", count: 3 });
    expect(s.favouriteCities[1]).toEqual({ name: "Vizag", count: 2 });
  });

  it("tracks online-only games separately (for leaderboard eligibility)", () => {
    expect(computeStats(results).online).toEqual({ games: 1, wins: 1 });
  });

  it("handles an empty history", () => {
    const s = computeStats([]);
    expect(s.games).toBe(0);
    expect(s.winRate).toBe(0);
    expect(s.currentStreak).toBe(0);
    expect(s.favouriteCities).toEqual([]);
  });
});
