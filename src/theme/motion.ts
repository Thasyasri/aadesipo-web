import { useReducedMotion as useMotionReducedMotion } from "motion/react";
import type { Transition } from "motion/react";

/**
 * Two presets, matching the original design spec:
 *  - snappy: UI chrome (buttons, sheets) — damping 18 / stiffness 220
 *  - playful: game objects (tokens, cards) — damping 12 / stiffness 160
 * Ease-curves are reserved for opacity only; everything else is a spring.
 */
export const springs = {
  snappy: {
    type: "spring",
    damping: 18,
    stiffness: 220,
  } satisfies Transition,
  playful: {
    type: "spring",
    damping: 12,
    stiffness: 160,
  } satisfies Transition,
} as const;

/**
 * The single reduced-motion gate every animated component should check.
 * Wraps motion's own hook so call sites import from the theme layer
 * rather than reaching into the animation library directly — keeps the
 * dependency swappable later without touching every component.
 */
export function useMotionPrefs(): { reduceMotion: boolean } {
  const reduceMotion = useMotionReducedMotion();
  return { reduceMotion: reduceMotion ?? false };
}

/** The 300ms law: no blocking animation exceeds this without being skippable. */
export const MAX_BLOCKING_MS = 300;
