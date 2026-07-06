import { describe, expect, it } from "vitest";
import { formatRupees, parseRupeesInput, unitToRupees } from "./currency";

describe("formatRupees", () => {
  it("formats small amounts as compact thousands", () => {
    expect(formatRupees(50)).toBe("₹50K");
  });

  it("uses K notation up to the exact boundary before Lakh", () => {
    expect(formatRupees(99)).toBe("₹99K");
    expect(formatRupees(100)).toBe("₹1 Lakh");
  });

  it("uses Lakh notation up to the exact boundary before Crore", () => {
    expect(formatRupees(9999.999)).toBe("₹100 Lakh");
    expect(formatRupees(10000)).toBe("₹1 Crore");
  });

  it("renders non-integer Lakh values with two decimal places", () => {
    expect(formatRupees(220)).toBe("₹2.20 Lakh");
  });

  it("renders non-integer Crore values with two decimal places", () => {
    expect(formatRupees(12340)).toBe("₹1.23 Crore");
  });

  it("avoids unnecessary .00 suffixes for whole-number Lakh values", () => {
    expect(formatRupees(200)).toBe("₹2 Lakh");
  });

  it("formats zero as a plain zero", () => {
    expect(formatRupees(0)).toBe("₹0");
  });
});

describe("parseRupeesInput (inverse of formatRupees scaling)", () => {
  it("converts a real rupee amount the user types into engine units", () => {
    // ₹1,50,000 that the user types should become 150 engine units.
    expect(parseRupeesInput(150000)).toBe(150);
    expect(parseRupeesInput(50000)).toBe(50);
  });

  it("round-trips with unitToRupees so the field is self-consistent", () => {
    for (const unit of [0, 50, 150, 1240]) {
      expect(parseRupeesInput(unitToRupees(unit))).toBe(unit);
    }
  });

  it("clamps empty/invalid/negative input to 0 and snaps to the nearest unit", () => {
    expect(parseRupeesInput(0)).toBe(0);
    expect(parseRupeesInput(-5000)).toBe(0);
    expect(parseRupeesInput(Number.NaN)).toBe(0);
    expect(parseRupeesInput(150400)).toBe(150); // snaps to ₹1,000 steps
    expect(parseRupeesInput(150600)).toBe(151);
  });
});
