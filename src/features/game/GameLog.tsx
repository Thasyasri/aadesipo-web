import { useEffect, useMemo, useRef } from "react";
import { getTile, JAIL_BAIL_COST, type GameEvent, type TradeAssets } from "@aadesipo/engine";
import { sfx } from "@/services/audio";
import { useTranslation, type TranslationKey } from "@/i18n";
import type { PlayerSetup } from "@/state/gameStore";
import { formatRupees } from "@/utils/currency";
import { tileNameWithCode } from "@/utils/tileCode";

type TFunc = (key: TranslationKey, params?: Record<string, string | number>) => string;
/** Resolves a player id to their display name (falling back to the id). */
type NameFor = (id: string) => string;

/** A trade side as text: "₹120 · Nizamabad (NZB) · 1 jail-free card", or "nothing". */
function assetsSummary(assets: TradeAssets): string {
  const parts: string[] = [];
  if (assets.cash > 0) parts.push(formatRupees(assets.cash));
  for (const pos of assets.propertyPositions) parts.push(tileNameWithCode(getTile(pos).name));
  const cards = assets.jailFreeCards ?? 0;
  if (cards > 0) parts.push(`${cards} jail-free card${cards > 1 ? "s" : ""}`);
  return parts.length ? parts.join(" · ") : "nothing";
}

const propName = (position: number) => tileNameWithCode(getTile(position).name);

function describeEvent(event: GameEvent, t: TFunc, nameFor: NameFor): string | null {
  switch (event.type) {
    case "DiceRolled":
      return t("gameLog.diceRolled", {
        player: nameFor(event.playerId),
        die1: event.die1,
        die2: event.die2,
      });
    case "PlayerMoved":
      // Every landing, so the log narrates the whole path around the board.
      return t("gameLog.landed", {
        player: nameFor(event.playerId),
        tile: propName(event.to),
      });
    case "PassedGo":
      return t("gameLog.passedGo", {
        player: nameFor(event.playerId),
        amount: formatRupees(event.salary),
      });
    case "SentToJail":
      return t("gameLog.sentToJail", { player: nameFor(event.playerId) });
    case "ReleasedFromJail":
      if (event.via === "bail")
        return t("gameLog.releasedFromJailBail", {
          player: nameFor(event.playerId),
          amount: formatRupees(JAIL_BAIL_COST),
        });
      if (event.via === "card")
        return t("gameLog.releasedFromJailCard", { player: nameFor(event.playerId) });
      return t("gameLog.releasedFromJail", { player: nameFor(event.playerId) });
    case "PropertyPurchased":
      return t("gameLog.propertyPurchased", {
        player: nameFor(event.playerId),
        property: propName(event.position),
        amount: formatRupees(event.price),
      });
    case "PropertyDeclined":
      return t("gameLog.propertyDeclined", {
        player: nameFor(event.playerId),
        property: propName(event.position),
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
    case "EventCardResolved": {
      const delta = event.cashDelta ?? 0;
      if (delta > 0) {
        return t("gameLog.eventCardGain", {
          player: nameFor(event.playerId),
          text: event.text,
          amount: formatRupees(delta),
        });
      }
      if (delta < 0) {
        return t("gameLog.eventCardLoss", {
          player: nameFor(event.playerId),
          text: event.text,
          amount: formatRupees(-delta),
        });
      }
      return t("gameLog.eventCard", { player: nameFor(event.playerId), text: event.text });
    }
    case "AuctionStarted":
      return t("gameLog.auctionStarted", { property: propName(event.position) });
    case "AuctionBid":
      return t("gameLog.auctionBid", {
        player: nameFor(event.playerId),
        amount: formatRupees(event.amount),
      });
    case "AuctionPassed":
      return t("gameLog.auctionPassed", { player: nameFor(event.playerId) });
    case "AuctionWon":
      return t("gameLog.auctionWon", {
        player: nameFor(event.playerId),
        property: propName(event.position),
        amount: formatRupees(event.amount),
      });
    case "AuctionVoided":
      return t("gameLog.auctionVoided", { property: propName(event.position) });
    case "PropertyMortgaged":
      return t("gameLog.propertyMortgaged", {
        player: nameFor(event.playerId),
        property: propName(event.position),
        amount: formatRupees(event.amount),
      });
    case "PropertyUnmortgaged":
      return t("gameLog.propertyUnmortgaged", {
        player: nameFor(event.playerId),
        property: propName(event.position),
      });
    case "HouseBuilt":
      return t("gameLog.houseBuilt", {
        player: nameFor(event.playerId),
        building: event.hasHotel ? t("gameLog.hotel") : t("gameLog.house"),
        property: propName(event.position),
      });
    case "HouseSold":
      return t("gameLog.houseSold", {
        player: nameFor(event.playerId),
        property: propName(event.position),
      });
    case "TradeProposed":
      return t("gameLog.tradeProposed", {
        proposer: nameFor(event.trade.proposerId),
        recipient: nameFor(event.trade.recipientId),
      });
    case "TradeExecuted":
      return t("gameLog.tradeExecuted", {
        proposer: nameFor(event.trade.proposerId),
        recipient: nameFor(event.trade.recipientId),
        gives: assetsSummary(event.trade.proposerGives),
        gets: assetsSummary(event.trade.recipientGives),
      });
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

/**
 * Plays the sound effect for each newly-appended event. Kept separate from the
 * (now behind-a-button) activity list so sounds still fire while the list is
 * closed. Renders nothing — mount it once, always, alongside the game.
 */
export function ActivitySounds({ events }: { events: readonly GameEvent[] }) {
  // null until the first render establishes the baseline, so restoring a full
  // history on resume doesn't replay every sound effect at once.
  const playedCount = useRef<number | null>(null);
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
  return null;
}

interface GameLogProps {
  /** The full accumulating activity log for the game. */
  events: readonly GameEvent[];
  /** Player setups, so log lines show display names instead of raw ids. */
  players: readonly PlayerSetup[];
}

/** The full activity feed as a plain list, newest first. Presentational — the
 *  container (the Activity sheet) supplies the heading and scrolling. */
export function GameLog({ events, players }: GameLogProps) {
  const { t } = useTranslation();

  // Resolve ids to display names at render time — events persist raw ids, so
  // lines restored after a reload get real names from the current setups too.
  const nameFor = useMemo(() => {
    const byId = new Map(players.map((p) => [p.id, p.displayName]));
    return (id: string) => byId.get(id) ?? id;
  }, [players]);

  // Newest first, so the latest action is at the top. Keys use the original
  // index (append-only log) so React reuses rows as the list grows.
  const lines = events
    .map((event, i) => ({ i, line: describeEvent(event, t, nameFor) }))
    .filter((row): row is { i: number; line: string } => row.line !== null)
    .reverse();

  if (lines.length === 0) {
    return <p className="text-body text-text-secondary">Nothing has happened yet.</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {lines.map(({ i, line }) => (
        <p key={i} className="text-body text-text-secondary">
          {line}
        </p>
      ))}
    </div>
  );
}
