/**
 * xoshiro128** — a small, fast, well-distributed PRNG. Public domain
 * algorithm (Blackman & Vigna). Chosen over Math.random() for exactly one
 * reason: it's seedable, so `applyAction(state, action, rng)` is a pure
 * function and replay/verification/anti-cheat all fall out for free.
 *
 * This file has no dependency on anything else in the engine — it's a
 * general-purpose seeded RNG that the rest of the engine consumes.
 */

export interface RngState {
  readonly s0: number;
  readonly s1: number;
  readonly s2: number;
  readonly s3: number;
}

/** A draw from the RNG: the number produced, and the state to use next. */
export interface RngDraw {
  readonly value: number; // in [0, 1)
  readonly nextState: RngState;
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/**
 * Splitmix32 — used only to expand a single numeric/string seed into the
 * four 32-bit words xoshiro128** needs. Not used for gameplay draws.
 */
function splitmix32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

/** Hash an arbitrary string seed down to a 32-bit integer (FNV-1a). */
function hashStringSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Builds the initial RNG state from a game seed. The same seed always
 * produces the same state, which is the whole point — a game's seed is
 * stored once (see serialization/) and the entire action log replays
 * identically from it on any device, or on the server for validation.
 */
export function createRngState(seed: string | number): RngState {
  const numericSeed = typeof seed === "string" ? hashStringSeed(seed) : seed >>> 0;
  const next = splitmix32(numericSeed);

  // xoshiro128** requires a non-all-zero seed; splitmix32 output being
  // all zero is astronomically unlikely but checked anyway for safety.
  let s0 = next();
  let s1 = next();
  let s2 = next();
  let s3 = next();
  if ((s0 | s1 | s2 | s3) === 0) {
    s0 = 1;
  }

  return { s0, s1, s2, s3 };
}

/**
 * One draw. Returns a float in [0, 1) and the next RNG state — the
 * caller threads the returned state into the next draw. Never mutates
 * its input, matching the engine-wide "no hidden mutation" rule.
 */
export function nextFloat(state: RngState): RngDraw {
  const { s0, s1, s2, s3 } = state;

  const result = (Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0) / 4294967296;

  const t = (s1 << 9) >>> 0;

  let ns2 = s2 ^ s0;
  let ns3 = s3 ^ s1;
  const ns1 = s1 ^ ns2;
  const ns0 = s0 ^ ns3;
  ns2 = (ns2 ^ t) >>> 0;
  ns3 = rotl(ns3, 11);

  return {
    value: result,
    nextState: { s0: ns0 >>> 0, s1: ns1 >>> 0, s2: ns2 >>> 0, s3: ns3 >>> 0 },
  };
}

/** Integer in [min, max], inclusive both ends — e.g. a die face. */
export function nextInt(state: RngState, min: number, max: number): RngDraw {
  const draw = nextFloat(state);
  const value = min + Math.floor(draw.value * (max - min + 1));
  return { value, nextState: draw.nextState };
}

/** Rolls two six-sided dice. Returns both faces and the advanced state. */
export interface DiceRoll {
  readonly die1: number;
  readonly die2: number;
  readonly isDoubles: boolean;
  readonly nextState: RngState;
}

export function rollDice(state: RngState): DiceRoll {
  const first = nextInt(state, 1, 6);
  const second = nextInt(first.nextState, 1, 6);
  return {
    die1: first.value,
    die2: second.value,
    isDoubles: first.value === second.value,
    nextState: second.nextState,
  };
}

/**
 * Rarity-weighted pick from a list of {weight} items — used by the event
 * decks (events/) to draw a Chance or Desi Funny card. Weights don't need
 * to sum to 1; they're normalized here.
 */
export function weightedPick<T extends { readonly weight: number }>(
  state: RngState,
  items: readonly T[],
): { readonly item: T; readonly nextState: RngState } {
  if (items.length === 0) {
    throw new Error("weightedPick: items must be non-empty");
  }

  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const draw = nextFloat(state);
  let threshold = draw.value * totalWeight;

  for (const item of items) {
    threshold -= item.weight;
    if (threshold <= 0) {
      return { item, nextState: draw.nextState };
    }
  }

  // Floating-point rounding can leave a sliver unconsumed — fall back to
  // the last item rather than throwing.
  const lastItem = items[items.length - 1];
  if (!lastItem) {
    throw new Error("weightedPick: unreachable — items was checked non-empty above");
  }
  return { item: lastItem, nextState: draw.nextState };
}
