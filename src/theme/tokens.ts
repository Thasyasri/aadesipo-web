/**
 * Mirrors the CSS custom properties defined in src/index.css.
 * Kept in sync by hand — there are few enough of these that a build-step
 * generator would be more ceremony than it's worth. If these drift from
 * the CSS, visual bugs will be obvious immediately (Pixi board colors
 * won't match the surrounding DOM chrome), so drift doesn't hide.
 */

export const PLAYER_COLORS = [
  "#FFB020", // marigold
  "#2DD4BF", // teal
  "#FF5D5D", // coral
  "#8B7CF6", // violet
  "#38BDF8", // sky
] as const;

export const BRAND_COLORS = {
  primary: "#FFB020",
  secondary: "#FF5D5D",
  accentTeal: "#2DD4BF",
  accentViolet: "#8B7CF6",
} as const;

export const SEMANTIC_COLORS = {
  success: "#34D399",
  warn: "#FBBF24",
  error: "#F87171",
  info: "#60A5FA",
} as const;

/** Hex string -> 0xRRGGBB number, the format Pixi.js/WebGL expects. */
export function hexToPixiColor(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}
