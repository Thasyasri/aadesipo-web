import { describe, expect, it } from "vitest";
import { contrastRatio, WCAG_AA_NORMAL_TEXT } from "./contrast";

const DARK = {
  bgBase: "#0F1222",
  bgSurface: "#1A1F35",
  bgRaised: "#242B47",
  textPrimary: "#F4F5FA",
  textSecondary: "#A3ABC7",
  brandPrimary: "#FFB020",
  brandSecondary: "#FF5D5D",
  semanticError: "#F87171",
};

const LIGHT = {
  bgBase: "#F7F5F2",
  bgSurface: "#FFFFFF",
  textPrimary: "#1A1F2E",
  textSecondary: "#5B6478",
  brandPrimaryStrong: "#B45309",
  brandSecondaryStrong: "#B91C1C",
};

const DARK_BUTTON_TEXT = "#1A1200"; // dark text used on bright button/badge backgrounds

// Every real text-on-background pairing actually used in the app. Add a
// row here whenever a new colored surface gets text on it — that's the
// whole point of this test existing.
const PAIRS: Array<[string, string, string]> = [
  ["dark: primary text on bg-base", DARK.textPrimary, DARK.bgBase],
  ["dark: primary text on bg-surface", DARK.textPrimary, DARK.bgSurface],
  ["dark: primary text on bg-raised", DARK.textPrimary, DARK.bgRaised],
  ["dark: secondary text on bg-base", DARK.textSecondary, DARK.bgBase],
  ["dark: secondary text on bg-surface", DARK.textSecondary, DARK.bgSurface],
  ["dark: button text on brand-primary (primary button)", DARK_BUTTON_TEXT, DARK.brandPrimary],
  [
    "dark: button text on brand-secondary (destructive button)",
    DARK_BUTTON_TEXT,
    DARK.brandSecondary,
  ],
  ["dark: badge text on semantic-error (mortgaged ribbon)", DARK_BUTTON_TEXT, DARK.semanticError],
  ["light: primary text on bg-base", LIGHT.textPrimary, LIGHT.bgBase],
  ["light: primary text on bg-surface", LIGHT.textPrimary, LIGHT.bgSurface],
  ["light: secondary text on bg-base", LIGHT.textSecondary, LIGHT.bgBase],
  ["light: secondary text on bg-surface", LIGHT.textSecondary, LIGHT.bgSurface],
  ["light: brand-primary-strong text on bg-base", LIGHT.brandPrimaryStrong, LIGHT.bgBase],
  ["light: brand-secondary-strong text on bg-base", LIGHT.brandSecondaryStrong, LIGHT.bgBase],
];

describe("WCAG AA contrast — every real text/background pair in the app", () => {
  it.each(PAIRS)("%s meets 4.5:1", (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });
});
