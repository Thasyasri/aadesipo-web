/**
 * @aadesipo/engine
 *
 * The single source of truth for AadesiPo's rules. Pure TypeScript.
 * No React, no DOM, no network I/O, no `any`. Runs identically in the
 * browser and inside Supabase Edge Functions (see supabase/functions).
 *
 * M4 status: core reducer, board/economy, movement, property/rent,
 * auctions, trading, mortgages/building, bankruptcy, win conditions,
 * and a small example event deck are real and tested.
 * M5 status: valuation model + three personalities (Miser/Gambler/
 * Troll) + skill-level difficulty are real and sim-benchmarked — proven
 * to beat a random baseline, proven statistically distinct from each
 * other, not just differently labeled. The full 60-80 card event
 * content pack is not part of either milestone.
 */

export const ENGINE_VERSION = "0.5.0" as const;

export * from "./core/index.js";
export * from "./rules/index.js";
export * from "./economy/index.js";
export * from "./events/index.js";
export * from "./rng/index.js";
export * from "./ai/index.js";
export * from "./serialization/index.js";
