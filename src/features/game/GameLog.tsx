import { useEffect, useMemo, useRef } from "react";
import type { GameEvent } from "@aadesipo/engine";
import { sfx } from "@/services/audio";
import { useTranslation, type TranslationKey } from "@/i18n";
import type { PlayerSetup } from "@/state/gameStore";
import { formatRupees } from "@/utils/currency";

type TFunc = (key: TranslationKey, params?: Record<string, string | number>) => string;
/** Resolves a player id to their display name (falling back to the id). */
type NameFor = (id: string) => string;

function describeEvent(event: GameEvent, t: TFunc, nameFor: NameFor): string | null {
  switch (event.type) {
    case "DiceRolled":
      return t("gameLog.diceRolled", {
        player: nameFor(event.playerId),
        die1: event.die1,
        die2: event.die2,
      });
    case "PassedGo":
      return t("gameLog.passedGo", {
        player: nameFor(event.playerId),
        amount: formatRupees(event.salary),
      });
    case "SentToJail":
      return t("gameLog.sentToJail", { player: nameFor(event.playerId) });
    case "ReleasedFromJail":
      return t("gameLog.releasedFromJail", { player: nameFor(event.playerId) });
    case "PropertyPurchased":
      return t("gameLog.propertyPurchased", {
        player: nameFor(event.playerId),
        amount: formatRupees(event.price),
      });
    case "RentPaid":
      return t("gameLog.rentPaid", {
        from: nameFor(event.fromId),
        to: nameFor(event.toId),
        amount: formatRupees(event.amount),
      });
    case "TaxPaid":
      return t("gameLog.taxPaid", {
        player: nameFor(event.playerId),
        amount: formatRupees(event.amount),
      });
    case "JackpotCollected":
      return t("gameLog.jackpotCollected", {
        player: nameFor(event.playerId),
        amount: formatRupees(event.amount),
      });
    case "LoanTaken":
      return t("gameLog.loanTaken", {
        player: nameFor(event.playerId),
        amount: formatRupees(event.amount),
      });
    case "LoanRepaid":
      return t("gameLog.loanRepaid", {
        player: nameFor(event.playerId),
        amount: formatRupees(event.amount),
      });
    case "DebtIncurred":
      return t("gameLog.debtIncurred", {
        player: nameFor(event.playerId),
        amount: formatRupees(event.amount),
        creditor: event.creditorId ? nameFor(event.creditorId) : "the bank",
      });
    case "EventCardResolved":
      return t("gameLog.eventCard", { player: nameFor(event.playerId), text: event.text });
    case "AuctionStarted":
      return t("gameLog.auctionStarted");
    case "AuctionWon":
      return t("gameLog.auctionWon", {
        player: nameFor(event.playerId),
        amount: formatRupees(event.amount),
      });
    case "AuctionVoided":
      return t("gameLog.auctionVoided");
    case "PropertyMortgaged":
      return t("gameLog.propertyMortgaged", {
        player: nameFor(event.playerId),
        amount: formatRupees(event.amount),
      });
    case "PropertyUnmortgaged":
      return t("gameLog.propertyUnmortgaged", { player: nameFor(event.playerId) });
    case "HouseBuilt":
      return t("gameLog.houseBuilt", {
        player: nameFor(event.playerId),
        building: event.hasHotel ? t("gameLog.hotel") : t("gameLog.house"),
      });
    case "HouseSold":
      return t("gameLog.houseSold", { player: nameFor(event.playerId) });
    case "TradeProposed":
      return t("gameLog.tradeProposed", {
        proposer: nameFor(event.trade.proposerId),
        recipient: nameFor(event.trade.recipientId),
      });
    case "TradeExecuted":
      return t("gameLog.tradeExecuted");
    case "TradeRejected":
      return t("gameLog.tradeRejected");
    case "PlayerBankrupted":
      return t("gameLog.playerBankrupted", { player: nameFor(event.playerId) });
    case "GameEnded":
      return t("gameLog.gameEnded", { player: event.winnerId ? nameFor(event.winnerId) : "" });
    default:
      return null;
  }
}

function playSfxFor(event: GameEvent): void {
  switch (event.type) {
    case "DiceRolled":
      sfx.diceRoll();
      break;
    case "PropertyPurchased":
    case "AuctionWon":
      sfx.purchase();
      break;
    case "PassedGo":
    case "JackpotCollected":
      sfx.cashGain();
      break;
    case "RentPaid":
    case "TaxPaid":
      sfx.cashLoss();
      break;
    case "PlayerBankrupted":
      sfx.error();
      break;
    case "GameEnded":
      sfx.victory();
      break;
    default:
      break;
  }
}

interface GameLogProps {
  /** The full accumulating activity log for the game. */
  events: readonly GameEvent[];
  /** Player setups, so log lines show display names instead of raw ids. */
  players: readonly PlayerSetup[];
}

export function GameLog({ events, players }: GameLogProps) {
  // null until the first render establishes the baseline, so restoring a full
  // history on resume doesn't replay every sound effect at once.
  const playedCount = useRef<number | null>(null);
  const { t } = useTranslation();

  // Resolve ids to display names at render time — events persist raw ids, so
  // lines restored after a reload get real names from the current setups too.
  const nameFor = useMemo(() => {
    const byId = new Map(players.map((p) => [p.id, p.displayName]));
    return (id: string) => byId.get(id) ?? id;
  }, [players]);

  useEffect(() => {
    if (playedCount.current === null) {
      playedCount.current = events.length;
      return;
    }
    for (const event of events.slice(playedCount.current)) {
      playSfxFor(event);
    }
    playedCount.current = events.length;
  }, [events]);

  // Newest first, so the latest action is always visible without scrolling
  // and older history is a scroll away. Keys use the original index (append-
  // only log) so React reuses rows as the list grows.
  const lines = events
    .map((event, i) => ({ i, line: describeEvent(event, t, nameFor) }))
    .filter((row): row is { i: number; line: string } => row.line !== null)
    .reverse();
  if (lines.length === 0) return null;

  return (
    <div className="flex min-h-0 flex-col border-t border-bg-raised">
      <div className="px-3 pb-1 pt-3 text-caption font-semibold uppercase tracking-wide text-text-secondary">
        Activity
      </div>
      <div className="flex max-h-[45vh] flex-col gap-1 overflow-y-auto px-3 pb-3">
        {lines.map(({ i, line }) => (
          <p key={i} className="text-caption text-text-secondary">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
