import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  createRngState,
  nextFloat,
  nextInt,
  rollDice,
  weightedPick,
  type RngState,
} from "../src/rng/index.js";

describe("createRngState", () => {
  it("is deterministic: same seed -> identical state", () => {
    expect(createRngState("game-seed-123")).toEqual(createRngState("game-seed-123"));
    expect(createRngState(42)).toEqual(createRngState(42));
  });

  it("different seeds produce different states", () => {
    expect(createRngState("seed-a")).not.toEqual(createRngState("seed-b"));
  });

  it("never produces an all-zero state (xoshiro128** requirement)", () => {
    fc.assert(
      fc.property(fc.string(), (seed) => {
        const s = createRngState(seed);
        expect(s.s0 | s.s1 | s.s2 | s.s3).not.toBe(0);
      }),
    );
  });
});

describe("nextFloat", () => {
  it("is pure: calling it twice on the same state gives the same result", () => {
    const state = createRngState("determinism-check");
    expect(nextFloat(state)).toEqual(nextFloat(state));
  });

  it("does not mutate its input state", () => {
    const state = createRngState("no-mutate");
    const before = { ...state };
    nextFloat(state);
    expect(state).toEqual(before);
  });

  it("always returns a value in [0, 1)", () => {
    fc.assert(
      fc.property(fc.string(), fc.nat({ max: 200 }), (seed, draws) => {
        let state = createRngState(seed);
        for (let i = 0; i < draws; i++) {
          const draw = nextFloat(state);
          expect(draw.value).toBeGreaterThanOrEqual(0);
          expect(draw.value).toBeLessThan(1);
          state = draw.nextState;
        }
      }),
    );
  });

  it("two full game-length replays from the same seed produce an identical sequence", () => {
    const seed = "replay-seed";
    const sequence = (s: string) => {
      let state = createRngState(s);
      const values: number[] = [];
      for (let i = 0; i < 500; i++) {
        const draw = nextFloat(state);
        values.push(draw.value);
        state = draw.nextState;
      }
      return values;
    };
    expect(sequence(seed)).toEqual(sequence(seed));
  });
});

describe("nextInt", () => {
  it("stays within [min, max] inclusive", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.integer({ min: -50, max: 50 }),
        fc.integer({ min: -50, max: 50 }),
        (seed, a, b) => {
          const [min, max] = a <= b ? [a, b] : [b, a];
          const state = createRngState(seed);
          const draw = nextInt(state, min, max);
          expect(draw.value).toBeGreaterThanOrEqual(min);
          expect(draw.value).toBeLessThanOrEqual(max);
        },
      ),
    );
  });
});

describe("rollDice", () => {
  it("both dice land in [1, 6]", () => {
    fc.assert(
      fc.property(fc.string(), (seed) => {
        const roll = rollDice(createRngState(seed));
        expect(roll.die1).toBeGreaterThanOrEqual(1);
        expect(roll.die1).toBeLessThanOrEqual(6);
        expect(roll.die2).toBeGreaterThanOrEqual(1);
        expect(roll.die2).toBeLessThanOrEqual(6);
      }),
    );
  });

  it("isDoubles is true exactly when both faces match", () => {
    fc.assert(
      fc.property(fc.string(), (seed) => {
        const roll = rollDice(createRngState(seed));
        expect(roll.isDoubles).toBe(roll.die1 === roll.die2);
      }),
    );
  });

  it("rolls roughly 1/6 doubles over a large sample (distribution sanity, not a hard bound)", () => {
    let state = createRngState("distribution-check");
    let doublesCount = 0;
    const trials = 20_000;
    for (let i = 0; i < trials; i++) {
      const roll = rollDice(state);
      if (roll.isDoubles) doublesCount++;
      state = roll.nextState;
    }
    const rate = doublesCount / trials;
    // Expected ~16.7%. Generous band since this is a sanity check, not a
    // statistical test suite — it exists to catch gross bias, not to
    // certify RNG quality.
    expect(rate).toBeGreaterThan(0.13);
    expect(rate).toBeLessThan(0.2);
  });
});

describe("weightedPick", () => {
  const items = [
    { id: "common", weight: 70 },
    { id: "rare", weight: 25 },
    { id: "legendary", weight: 5 },
  ] as const;

  it("throws on an empty list rather than picking undefined", () => {
    expect(() => weightedPick(createRngState("x"), [])).toThrow();
  });

  it("only ever returns an item from the input list", () => {
    fc.assert(
      fc.property(fc.string(), (seed) => {
        const result = weightedPick(createRngState(seed), items);
        expect(items).toContain(result.item);
      }),
    );
  });

  it("respects weighting over a large sample", () => {
    let state = createRngState("weight-check");
    const counts: Record<string, number> = { common: 0, rare: 0, legendary: 0 };
    const trials = 20_000;
    for (let i = 0; i < trials; i++) {
      const result = weightedPick(state, items);
      counts[result.item.id]!++;
      state = result.nextState;
    }
    // 70/25/5 split — generous bands, this is a sanity check.
    expect(counts.common! / trials).toBeGreaterThan(0.6);
    expect(counts.legendary! / trials).toBeLessThan(0.1);
  });
});

describe("cross-cutting: RngState is always a plain, serializable value", () => {
  it("round-trips through JSON without loss", () => {
    fc.assert(
      fc.property(fc.string(), (seed) => {
        const state: RngState = createRngState(seed);
        const roundTripped = JSON.parse(JSON.stringify(state)) as RngState;
        expect(roundTripped).toEqual(state);
      }),
    );
  });
});
