/**
 * Flat, single-colour line icons for the marketing site — one family, drawn
 * on a 24px grid, `currentColor` stroke so each inherits its tile's tone.
 * Purely presentational; no game logic depends on these.
 */
import type { ReactElement } from "react";

const s = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Tile / place icons, keyed for the board showcase + hero fan. */
export const placeIcons: Record<string, ReactElement> = {
  building: (
    <svg {...s}>
      <path d="M4 21V6l8-3 8 3v15" />
      <path d="M9 21v-5h6v5" />
      <path d="M8 9h.01M12 9h.01M16 9h.01M8 12h.01M16 12h.01" />
      <path d="M3 21h18" />
    </svg>
  ),
  arch: (
    <svg {...s}>
      <path d="M3 21h18" />
      <path d="M5 21V11a7 7 0 0 1 14 0v10" />
      <path d="M9 21v-5a3 3 0 0 1 6 0v5" />
      <path d="M5 11h14" />
    </svg>
  ),
  boat: (
    <svg {...s}>
      <path d="M3 18h18l-2 3H5z" />
      <path d="M12 3v11" />
      <path d="M12 5l7 6H12z" />
    </svg>
  ),
  beach: (
    <svg {...s}>
      <circle cx="17.5" cy="6.5" r="2.6" />
      <path d="M2 15c2-1.8 4-1.8 6 0s4 1.8 6 0 4-1.8 6 0" />
      <path d="M2 19c2-1.8 4-1.8 6 0s4 1.8 6 0 4-1.8 6 0" />
    </svg>
  ),
  temple: (
    <svg {...s}>
      <path d="M12 2 4 8h16z" />
      <path d="M6 8v10M18 8v10M10 8v10M14 8v10" />
      <path d="M4 21h16" />
      <path d="M10 21v-4h4v4" />
    </svg>
  ),
  skyline: (
    <svg {...s}>
      <path d="M2 21h20" />
      <path d="M3 21V12l4-2v11" />
      <path d="M9 21V6l6-3v18" />
      <path d="M15 21V11l5 2v8" />
    </svg>
  ),
  charminar: (
    <svg {...s}>
      <path d="M3 21h18" />
      <path d="M5 21V11M9 21V11M15 21V11M19 21V11" />
      <path d="M4 11h16" />
      <path d="M8 11a4 4 0 0 1 8 0" />
      <path d="M12 4v3" />
    </svg>
  ),
  dome: (
    <svg {...s}>
      <path d="M12 3c-2.2 2-3.5 4.2-3.5 6.5h7C15.5 7.2 14.2 5 12 3z" />
      <path d="M6 21V10h12v11" />
      <path d="M4 21h16" />
      <path d="M10 21v-5h4v5" />
    </svg>
  ),
  chai: (
    <svg {...s}>
      <path d="M6 9h9a3 3 0 0 1 0 6h-1" />
      <path d="M6 9v7a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2" />
      <path d="M8 4v2M11 4v2" />
    </svg>
  ),
};

/** Feature-row icons (gold on tinted chips). */
export const featureIcons: Record<string, ReactElement> = {
  bolt: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 2 3 14h7l-1 8 10-12h-7z" />
    </svg>
  ),
  skill: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v18" />
      <path d="m8 7 4-4 4 4" />
      <path d="M4 21h16" />
      <circle cx="12" cy="14" r="3" />
    </svg>
  ),
  pin: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  ),
  people: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="10" r="2.4" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M14.5 20a5 5 0 0 1 6.5-4.8" />
    </svg>
  ),
};

export const PlayIcon = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.4}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

export const ArrowUpIcon = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={3}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

export const LotusIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4}>
    <path d="M12 3c2.2 2 2.2 5 0 7-2.2-2-2.2-5 0-7z" />
    <path d="M12 21c-2.2-2-2.2-5 0-7 2.2 2 2.2 5 0 7z" />
    <path d="M3 12c2-2.2 5-2.2 7 0-2 2.2-5 2.2-7 0z" />
    <path d="M21 12c-2-2.2-5-2.2-7 0 2 2.2 5 2.2 7 0z" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);
