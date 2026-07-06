import type { GameEvent, TradeOffer } from "@aadesipo/engine";

export type TradeStatus = "pending" | "accepted" | "rejected";

export interface TradeRecord {
  readonly trade: TradeOffer;
  readonly status: TradeStatus;
}

/**
 * Reconstructs the full trade lifecycle from the game's event log — which is
 * itself persisted (rebuilt from actions on resume), so trade history survives
 * a reload for free. Each trade's structured detail is captured at proposal
 * time; TradeExecuted / TradeRejected only flip its status.
 */
export function buildTradeHistory(events: readonly GameEvent[]): TradeRecord[] {
  const byId = new Map<string, { trade: TradeOffer; status: TradeStatus }>();
  const order: string[] = [];
  for (const event of events) {
    if (event.type === "TradeProposed") {
      byId.set(event.trade.id, { trade: event.trade, status: "pending" });
      order.push(event.trade.id);
    } else if (event.type === "TradeExecuted") {
      const record = byId.get(event.trade.id);
      if (record) record.status = "accepted";
    } else if (event.type === "TradeRejected") {
      const record = byId.get(event.tradeId);
      if (record) record.status = "rejected";
    }
  }
  return order.map((id) => byId.get(id)!);
}
