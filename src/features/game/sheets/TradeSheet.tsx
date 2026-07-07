import { useEffect, useState } from "react";
import {
  getTile,
  ownershipAt,
  propertiesOwnedBy,
  type Action,
  type GameEvent,
  type GameState,
  type TradeAssets,
} from "@aadesipo/engine";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { GROUP_COLORS } from "@/theme/groupColors";
import type { PlayerSetup } from "@/state/gameStore";
import { formatRupees, parseRupeesInput, unitToRupees } from "@/utils/currency";
import { assetsValue, tradeBreakdown } from "./tradeValue";
import { buildTradeHistory, type TradeRecord } from "./tradeHistory";

interface TradeSheetProps {
  game: GameState;
  players: readonly PlayerSetup[];
  /** The local human who proposes from this device (acting player in Pass &
   *  Play; the human in Vs. AI). Responding is decoupled from this — any
   *  local recipient can answer a pending trade. */
  currentPlayerId: string;
  /** Player ids this device controls — every human seat in Pass & Play, but
   *  only the signed-in user online. Determines who can answer a pending trade
   *  from here. */
  localPlayerIds: readonly string[];
  eventLog: readonly GameEvent[];
  open: boolean;
  onClose: () => void;
  dispatch: (action: Action) => void;
}

type View = "trade" | "history" | "help";

export function TradeSheet(props: TradeSheetProps) {
  const [view, setView] = useState<View>("trade");
  useEffect(() => {
    if (props.open) setView("trade");
  }, [props.open]);

  return (
    <BottomSheet open={props.open} onClose={props.onClose}>
      <div className="mb-3 flex items-center justify-end gap-3 text-caption">
        {view === "trade" ? (
          <>
            <button
              type="button"
              className="font-semibold text-text-secondary hover:text-text-primary"
              onClick={() => setView("history")}
            >
              Trade history
            </button>
            <button
              type="button"
              aria-label="Trade rules"
              className="flex h-6 w-6 items-center justify-center rounded-full border border-bg-raised font-semibold text-text-secondary hover:text-text-primary"
              onClick={() => setView("help")}
            >
              ?
            </button>
          </>
        ) : (
          <button
            type="button"
            className="mr-auto font-semibold text-text-secondary hover:text-text-primary"
            onClick={() => setView("trade")}
          >
            ← Back
          </button>
        )}
      </div>

      {view === "history" ? (
        <TradesHistory eventLog={props.eventLog} players={props.players} />
      ) : view === "help" ? (
        <TradeHelp />
      ) : (
        <TradeMain {...props} />
      )}
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nameFor(players: readonly PlayerSetup[], id: string): string {
  return players.find((p) => p.id === id)?.displayName ?? id;
}

function isLocalHuman(localPlayerIds: readonly string[], id: string): boolean {
  return localPlayerIds.includes(id);
}

/** Positions a player owns that can actually be traded (no buildings — the
 *  engine rejects trading a property that still has houses/hotel). */
function tradeableProperties(game: GameState, playerId: string): number[] {
  return propertiesOwnedBy(game, playerId).filter((position) => {
    const o = ownershipAt(game, position);
    return o && o.houses === 0 && !o.hasHotel;
  });
}

function assetsText(assets: TradeAssets): string {
  const parts: string[] = [];
  if (assets.cash > 0) parts.push(formatRupees(assets.cash));
  for (const position of assets.propertyPositions) parts.push(getTile(position).name);
  const cards = assets.jailFreeCards ?? 0;
  if (cards > 0) parts.push(`${cards} jail-free card${cards > 1 ? "s" : ""}`);
  return parts.length ? parts.join(" · ") : "Nothing";
}

// ---------------------------------------------------------------------------
// The main trade view: propose / respond / waiting / other-pending.
// ---------------------------------------------------------------------------

function TradeMain({
  game,
  players,
  currentPlayerId,
  localPlayerIds,
  open,
  onClose,
  dispatch,
}: TradeSheetProps) {
  const pending = game.pendingTrade;

  if (pending) {
    // Responding is decoupled from turn order: any local recipient can answer.
    if (isLocalHuman(localPlayerIds, pending.recipientId)) {
      return <RespondView game={game} players={players} dispatch={dispatch} onClose={onClose} />;
    }
    if (isLocalHuman(localPlayerIds, pending.proposerId)) {
      return <WaitingView game={game} players={players} dispatch={dispatch} />;
    }
    return <OtherPendingView game={game} players={players} />;
  }

  return (
    <ProposeFlow
      game={game}
      players={players}
      currentPlayerId={currentPlayerId}
      open={open}
      dispatch={dispatch}
      onClose={onClose}
    />
  );
}

// ---------------------------------------------------------------------------
// Propose flow: choose a partner, then build the offer.
// ---------------------------------------------------------------------------

function ProposeFlow({
  game,
  players,
  currentPlayerId,
  open,
  dispatch,
  onClose,
}: {
  game: GameState;
  players: readonly PlayerSetup[];
  currentPlayerId: string;
  open: boolean;
  dispatch: (action: Action) => void;
  onClose: () => void;
}) {
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [giveProps, setGiveProps] = useState<readonly number[]>([]);
  const [getProps, setGetProps] = useState<readonly number[]>([]);
  // Cash amounts are held in real rupees (what the user types); converted to
  // engine units only when the offer is built.
  const [giveCashRupees, setGiveCashRupees] = useState(0);
  const [getCashRupees, setGetCashRupees] = useState(0);
  const [giveCards, setGiveCards] = useState(0);
  const [getCards, setGetCards] = useState(0);

  useEffect(() => {
    if (open) {
      setRecipientId(null);
      setGiveProps([]);
      setGetProps([]);
      setGiveCashRupees(0);
      setGetCashRupees(0);
      setGiveCards(0);
      setGetCards(0);
    }
  }, [open]);

  const me = game.players.find((p) => p.id === currentPlayerId);
  const others = game.players.filter((p) => p.id !== currentPlayerId && !p.isBankrupt);

  if (!recipientId) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-title">Propose a trade</h2>
        <p className="text-caption text-text-secondary">Who do you want to trade with?</p>
        <div className="flex flex-col gap-2">
          {others.length === 0 ? (
            <p className="text-body text-text-secondary">No one else to trade with.</p>
          ) : (
            others.map((p) => (
              <Button
                key={p.id}
                variant="secondary"
                className="justify-start"
                onClick={() => setRecipientId(p.id)}
              >
                {nameFor(players, p.id)}
              </Button>
            ))
          )}
        </div>
      </div>
    );
  }

  const recipient = game.players.find((p) => p.id === recipientId);
  const give: TradeAssets = {
    cash: parseRupeesInput(giveCashRupees),
    propertyPositions: giveProps,
    jailFreeCards: giveCards,
  };
  const get: TradeAssets = {
    cash: parseRupeesInput(getCashRupees),
    propertyPositions: getProps,
    jailFreeCards: getCards,
  };
  const breakdown = tradeBreakdown(give, get);
  const nothingOffered = assetsValue(give) === 0 && assetsValue(get) === 0;

  const send = () => {
    dispatch({
      type: "ProposeTrade",
      proposerId: currentPlayerId,
      recipientId,
      proposerGives: give,
      recipientGives: get,
    });
    onClose();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-title">Trade with {nameFor(players, recipientId)}</h2>
        <button
          type="button"
          className="text-caption text-text-secondary underline"
          onClick={() => setRecipientId(null)}
        >
          Change
        </button>
      </div>

      <OfferSection
        title="You give"
        positions={tradeableProperties(game, currentPlayerId)}
        selected={giveProps}
        onToggle={(pos) => setGiveProps((s) => toggle(s, pos))}
        cashRupees={giveCashRupees}
        maxCashRupees={unitToRupees(me?.cash ?? 0)}
        onCash={setGiveCashRupees}
        cards={giveCards}
        maxCards={me?.jailFreeCards ?? 0}
        onCards={setGiveCards}
      />
      <OfferSection
        title="You get"
        positions={tradeableProperties(game, recipientId)}
        selected={getProps}
        onToggle={(pos) => setGetProps((s) => toggle(s, pos))}
        cashRupees={getCashRupees}
        maxCashRupees={unitToRupees(recipient?.cash ?? 0)}
        onCash={setGetCashRupees}
        cards={getCards}
        maxCards={recipient?.jailFreeCards ?? 0}
        onCards={setGetCards}
      />

      <ValueBreakdown breakdown={breakdown} />

      {/* Pinned to the bottom of the scroll area so Send stays reachable on
          short/landscape phones no matter how tall the offer form grows. */}
      <div className="sticky bottom-0 -mx-6 flex gap-3 border-t border-black/10 bg-bg-raised px-6 pb-1 pt-3 dark:border-white/10">
        <Button variant="secondary" className="flex-1" onClick={() => setRecipientId(null)}>
          Back
        </Button>
        <Button variant="primary" className="flex-1" disabled={nothingOffered} onClick={send}>
          Send offer
        </Button>
      </div>
    </div>
  );
}

function toggle(list: readonly number[], value: number): number[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function OfferSection({
  title,
  positions,
  selected,
  onToggle,
  cashRupees,
  maxCashRupees,
  onCash,
  cards,
  maxCards,
  onCards,
}: {
  title: string;
  positions: readonly number[];
  selected: readonly number[];
  onToggle: (position: number) => void;
  cashRupees: number;
  maxCashRupees: number;
  onCash: (rupees: number) => void;
  cards: number;
  maxCards: number;
  onCards: (cards: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-caption font-semibold uppercase tracking-wide text-text-secondary">
        {title}
      </h3>
      {positions.length === 0 ? (
        <p className="text-caption text-text-disabled">No tradeable properties.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {positions.map((position) => (
            <PropertyChip
              key={position}
              position={position}
              active={selected.includes(position)}
              onClick={() => onToggle(position)}
            />
          ))}
        </div>
      )}
      <label className="flex flex-wrap items-center gap-2 text-caption text-text-secondary">
        Cash ₹
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={maxCashRupees}
          value={cashRupees === 0 ? "" : cashRupees}
          placeholder="0"
          onChange={(e) => {
            const rupees = Math.floor(Number(e.target.value));
            onCash(Number.isFinite(rupees) ? Math.max(0, Math.min(maxCashRupees, rupees)) : 0);
          }}
          className="w-32 rounded-md border border-bg-raised bg-bg-base px-2 py-1 text-right text-body tabular-nums text-text-primary outline-none focus:border-brand-primary"
        />
        <span className="text-micro text-text-disabled">
          / ₹{maxCashRupees.toLocaleString("en-IN")}
        </span>
      </label>
      {maxCards > 0 && (
        <div className="flex items-center gap-2 text-caption text-text-secondary">
          Jail-free cards
          <button
            type="button"
            aria-label="Remove a jail-free card"
            disabled={cards <= 0}
            onClick={() => onCards(Math.max(0, cards - 1))}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-bg-raised text-lg font-semibold text-text-primary disabled:opacity-40"
          >
            −
          </button>
          <span className="w-4 text-center tabular-nums text-text-primary">{cards}</span>
          <button
            type="button"
            aria-label="Add a jail-free card"
            disabled={cards >= maxCards}
            onClick={() => onCards(Math.min(maxCards, cards + 1))}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-bg-raised text-lg font-semibold text-text-primary disabled:opacity-40"
          >
            +
          </button>
          <span className="text-micro text-text-disabled">/ {maxCards}</span>
        </div>
      )}
    </div>
  );
}

function PropertyChip({
  position,
  active,
  onClick,
}: {
  position: number;
  active: boolean;
  onClick: () => void;
}) {
  const tile = getTile(position);
  const color = tile.type === "property" ? GROUP_COLORS[tile.group] : "#5A6284";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-9 items-center gap-2 rounded-pill border px-3 py-2 text-caption transition-colors ${
        active
          ? "border-brand-primary bg-bg-raised text-text-primary"
          : "border-bg-raised bg-bg-surface text-text-secondary"
      }`}
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span className="font-semibold">{tile.name}</span>
      <span className="tabular-nums text-text-disabled">
        {"price" in tile ? formatRupees(tile.price) : ""}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Value breakdown + offer readouts.
// ---------------------------------------------------------------------------

function ValueBreakdown({ breakdown }: { breakdown: ReturnType<typeof tradeBreakdown> }) {
  const gain = breakdown.net >= 0;
  return (
    <div className="flex flex-col gap-1 rounded-md bg-bg-surface p-3 text-body">
      <div className="flex justify-between">
        <span className="text-text-secondary">You give</span>
        <span className="font-semibold tabular-nums">{formatRupees(breakdown.give)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-text-secondary">You get</span>
        <span className="font-semibold tabular-nums">{formatRupees(breakdown.get)}</span>
      </div>
      <div className="mt-1 flex justify-between border-t border-bg-raised pt-1">
        <span className="font-semibold">{gain ? "You gain" : "You lose"}</span>
        <span
          className={`font-bold tabular-nums ${gain ? "text-semantic-success" : "text-semantic-error"}`}
        >
          {formatRupees(Math.abs(breakdown.net))}
        </span>
      </div>
    </div>
  );
}

function OfferReadout({ title, assets }: { title: string; assets: TradeAssets }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-caption font-semibold uppercase tracking-wide text-text-secondary">
        {title}
      </h3>
      <p className="text-body text-text-primary">{assetsText(assets)}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Respond / waiting / other-pending views.
// ---------------------------------------------------------------------------

function RespondView({
  game,
  players,
  dispatch,
  onClose,
}: {
  game: GameState;
  players: readonly PlayerSetup[];
  dispatch: (action: Action) => void;
  onClose: () => void;
}) {
  const trade = game.pendingTrade!;
  const breakdown = tradeBreakdown(trade.recipientGives, trade.proposerGives);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-title">
        {nameFor(players, trade.proposerId)} offers a trade
      </h2>
      <p className="text-caption text-text-secondary">
        Responding to {nameFor(players, trade.recipientId)} — accept or reject.
      </p>

      <OfferReadout title="They give you" assets={trade.proposerGives} />
      <OfferReadout title="You give them" assets={trade.recipientGives} />
      <ValueBreakdown breakdown={breakdown} />

      <div className="sticky bottom-0 -mx-6 flex gap-3 border-t border-black/10 bg-bg-raised px-6 pb-1 pt-3 dark:border-white/10">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => {
            dispatch({ type: "RejectTrade", playerId: trade.recipientId, tradeId: trade.id });
            onClose();
          }}
        >
          Reject
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          onClick={() => {
            dispatch({ type: "AcceptTrade", playerId: trade.recipientId, tradeId: trade.id });
            onClose();
          }}
        >
          Accept
        </Button>
      </div>
    </div>
  );
}

function WaitingView({
  game,
  players,
  dispatch,
}: {
  game: GameState;
  players: readonly PlayerSetup[];
  dispatch: (action: Action) => void;
}) {
  const trade = game.pendingTrade!;
  const breakdown = tradeBreakdown(trade.proposerGives, trade.recipientGives);
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-title">Offer sent</h2>
      <p className="text-body text-text-secondary">
        Waiting for {nameFor(players, trade.recipientId)}&apos;s response…
      </p>
      <OfferReadout title="You give" assets={trade.proposerGives} />
      <OfferReadout title="You get" assets={trade.recipientGives} />
      <ValueBreakdown breakdown={breakdown} />
      <Button
        variant="tertiary"
        onClick={() =>
          dispatch({ type: "RejectTrade", playerId: trade.proposerId, tradeId: trade.id })
        }
      >
        Cancel offer
      </Button>
    </div>
  );
}

function OtherPendingView({ game, players }: { game: GameState; players: readonly PlayerSetup[] }) {
  const trade = game.pendingTrade!;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-title">A trade is in progress</h2>
      <p className="text-body text-text-secondary">
        {nameFor(players, trade.proposerId)} and {nameFor(players, trade.recipientId)} have a
        pending trade. You can propose your own once it&apos;s resolved.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trade history (Ongoing / Past / Failed) + rules help.
// ---------------------------------------------------------------------------

function TradesHistory({
  eventLog,
  players,
}: {
  eventLog: readonly GameEvent[];
  players: readonly PlayerSetup[];
}) {
  const history = buildTradeHistory(eventLog);
  const ongoing = history.filter((r) => r.status === "pending");
  const accepted = history.filter((r) => r.status === "accepted");
  const rejected = history.filter((r) => r.status === "rejected");

  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-display text-title">Trade history</h2>
      <HistorySection
        title="Ongoing"
        records={ongoing}
        players={players}
        empty="No trade in progress."
      />
      <HistorySection
        title="Past (accepted)"
        records={accepted}
        players={players}
        empty="No accepted trades yet."
      />
      <HistorySection
        title="Failed (rejected)"
        records={rejected}
        players={players}
        empty="No rejected trades yet."
      />
    </div>
  );
}

function HistorySection({
  title,
  records,
  players,
  empty,
}: {
  title: string;
  records: readonly TradeRecord[];
  players: readonly PlayerSetup[];
  empty: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-caption font-semibold uppercase tracking-wide text-text-secondary">
        {title}
      </h3>
      {records.length === 0 ? (
        <p className="text-caption text-text-disabled">{empty}</p>
      ) : (
        records.map((record) => (
          <TradeRecordCard key={record.trade.id} record={record} players={players} />
        ))
      )}
    </section>
  );
}

function TradeRecordCard({
  record,
  players,
}: {
  record: TradeRecord;
  players: readonly PlayerSetup[];
}) {
  const { trade } = record;
  return (
    <div className="flex flex-col gap-1 rounded-md bg-bg-surface p-3 text-caption">
      <div className="font-semibold text-text-primary">
        {nameFor(players, trade.proposerId)} → {nameFor(players, trade.recipientId)}
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-text-secondary">Offered</span>
        <span className="text-right text-text-primary">{assetsText(trade.proposerGives)}</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-text-secondary">In return</span>
        <span className="text-right text-text-primary">{assetsText(trade.recipientGives)}</span>
      </div>
    </div>
  );
}

function TradeHelp() {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-title">How trading works</h2>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-text-secondary">
        <li>Offer any mix of your owned properties and/or cash, and ask for any mix back.</li>
        <li>
          Trades aren&apos;t tied to turn order — you can propose or respond at any time,
          whoever&apos;s rolling.
        </li>
        <li>Only one trade can be pending at a time.</li>
        <li>
          AI opponents respond after a brief &ldquo;thinking&rdquo; pause; other players sharing
          this device can respond any time from the Trade button.
        </li>
        <li>Decisions are accept or reject only — there are no counter-offers in this version.</li>
        <li>Every trade&apos;s outcome (accepted or rejected) is recorded in Trade history.</li>
      </ul>
    </div>
  );
}
