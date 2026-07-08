import type { PropertyGroup } from "@aadesipo/engine";

// Premium collectible tones (D3a) — one distinct tone per colour group, shared
// with the marketing site's --p-* palette so the board matches the whole app.
export const GROUP_COLORS: Record<PropertyGroup, string> = {
  brown: "#D8B17D", // sand
  "light-blue": "#7AB6E8", // sky
  pink: "#A991F7", // lavender
  orange: "#E6B54A", // gold
  red: "#EF6A5B", // coral
  yellow: "#A7BF5D", // olive
  green: "#72C7A6", // mint
  "dark-blue": "#7C8CA8", // slate
};
