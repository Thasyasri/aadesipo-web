import type { GameEvent } from "@aadesipo/engine";

export function computeCashDeltas(events: readonly GameEvent[]): Record<string, number> {
  const deltas: Record<string, number> = {};
  const add = (id: string, amount: number) => {
    deltas[id] = (deltas[id] ?? 0) + amount;
  };

  for (const event of events) {
    switch (event.type) {
      case "PassedGo":
        add(event.playerId, event.salary);
        break;
      case "PropertyPurchased":
        add(event.playerId, -event.price);
        break;
      case "RentPaid":
        add(event.fromId, -event.amount);
        add(event.toId, event.amount);
        break;
      case "TaxPaid":
        add(event.playerId, -event.amount);
        break;
      case "AuctionWon":
        add(event.playerId, -event.amount);
        break;
      case "PropertyMortgaged":
        add(event.playerId, event.amount);
        break;
      case "PropertyUnmortgaged":
        add(event.playerId, -event.amount);
        break;
      default:
        break;
    }
  }

  return deltas;
}
