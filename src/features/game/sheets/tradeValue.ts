import { getTile, isOwnable, JAIL_BAIL_COST, type TradeAssets } from "@aadesipo/engine";

/** A jail-free card's worth for offer comparison — the bail it spares. */
export const JAIL_FREE_CARD_VALUE = JAIL_BAIL_COST;

/**
 * Cash + the sum of each property's *real* list price (not any AI valuation
 * heuristic) + any jail-free cards. This is what the trade UI shows so both
 * sides can compare offers by actual worth.
 */
export function assetsValue(assets: TradeAssets): number {
  const propertyValue = assets.propertyPositions.reduce((sum, position) => {
    const tile = getTile(position);
    return sum + (isOwnable(tile) ? tile.price : 0);
  }, 0);
  return assets.cash + propertyValue + (assets.jailFreeCards ?? 0) * JAIL_FREE_CARD_VALUE;
}

export interface TradeBreakdown {
  /** Total value handed over by the perspective player. */
  give: number;
  /** Total value received by the perspective player. */
  get: number;
  /** get - give: positive means the perspective player comes out ahead. */
  net: number;
}

/**
 * The give/get/net breakdown from one player's perspective. `give` is the
 * value of what that player hands over, `get` the value of what they receive.
 */
export function tradeBreakdown(give: TradeAssets, get: TradeAssets): TradeBreakdown {
  const giveValue = assetsValue(give);
  const getValue = assetsValue(get);
  return { give: giveValue, get: getValue, net: getValue - giveValue };
}
