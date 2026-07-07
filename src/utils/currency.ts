function formatDecimal(value: number): string {
  const rounded = value.toFixed(2);
  return rounded.endsWith(".00") ? rounded.replace(/\.00$/, "") : rounded;
}

/**
 * Inverse of formatRupees' internal ×1000 scaling: converts a real rupee
 * amount the user types (e.g. 150000) into the engine's internal unit (150,
 * where 1 unit = ₹1,000). Cash trades in ₹1,000 steps, so the value snaps to
 * the nearest whole unit. Returns 0 for empty/invalid/negative input.
 */
export function parseRupeesInput(rupees: number): number {
  if (!Number.isFinite(rupees) || rupees <= 0) return 0;
  return Math.round(rupees / 1000);
}

/** A raw engine unit expressed back as a real rupee amount (the value the
 *  user sees/types), e.g. 150 -> 150000. */
export function unitToRupees(rawAmount: number): number {
  return rawAmount * 1000;
}

/**
 * Ultra-compact price for the cramped on-board tile labels — `₹1.8L`, `₹2.4L`,
 * `₹1Cr` — so a rotated price string doesn't run the full height of a side
 * tile and cross the name. The full `formatRupees` form is used everywhere
 * there is room (sheets, cards, log).
 */
export function formatRupeesCompact(rawAmount: number): string {
  const amount = Math.round(rawAmount * 1000);
  if (amount >= 10000000) return `₹${formatDecimal(amount / 10000000)}Cr`;
  if (amount >= 100000) return `₹${formatDecimal(amount / 100000)}L`;
  if (amount >= 1000) return `₹${Math.round(amount / 1000)}K`;
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function formatRupees(rawAmount: number): string {
  const amount = Math.round(rawAmount * 1000);

  if (amount < 100000) {
    if (amount >= 1000) {
      const roundedThousands = Math.round(amount / 1000);
      return `₹${roundedThousands}K`;
    }
    return `₹${amount.toLocaleString("en-IN")}`;
  }

  if (amount < 10000000) {
    const lakhs = amount / 100000;
    return Number.isInteger(lakhs) ? `₹${lakhs} Lakh` : `₹${formatDecimal(lakhs)} Lakh`;
  }

  const crores = amount / 10000000;
  return Number.isInteger(crores) ? `₹${crores} Crore` : `₹${formatDecimal(crores)} Crore`;
}
