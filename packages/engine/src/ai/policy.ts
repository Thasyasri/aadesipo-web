import type { Action, GameState, TradeOffer } from "../core/types.js";
import { getActingPlayerId } from "../core/reducer.js";
import { JAIL_BAIL_COST, isOwnable, getTile, BOARD, propertiesInGroup } from "../economy/index.js";
import { canBuildOnProperty, ownerOf, ownershipAt, propertiesOwnedBy } from "../rules/property.js";
import { canSellEvenly } from "../rules/property.js";
import { loanCap } from "../rules/loans.js";
import { nextFloat, type RngState } from "../rng/index.js";
import { maxAuctionBid, propertyValue } from "./valuation.js";
import type { PersonalityParams } from "./personalities.js";

export interface AiConfig {
  readonly personality: PersonalityParams;
  /** 0-1. Same valuation model at every level — this only controls how
   *  often the AI takes the valuation's answer vs. a plausible-but-
   *  suboptimal alternative. 1.0 always takes the model's answer. */
  readonly skillLevel: number;
}

export interface AiDecision {
  readonly action: Action;
  readonly nextRng: RngState;
}

/**
 * The playerId is derived from state, not accepted as a parameter — the
 * acting player during an auction is whoever's turn it is to bid, which
 * is NOT always the current player by turn order. Deriving it here
 * instead of trusting the caller removes that whole bug class at the
 * API boundary (this exact mistake was made once already, in this
 * milestone's own test harness — see the M5 notes on getActingPlayerId).
 *
 * Fake think-time pacing (600-1500ms) is a UI/adapter concern, not this function's.
 */
export function chooseAiAction(state: GameState, config: AiConfig, rng: RngState): AiDecision {
  const playerId = getActingPlayerId(state);
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error(`chooseAiAction: no player ${playerId}`);

  if (state.turnPhase === "awaiting-roll") {
    if (player.inJail) return decideJailAction(state, playerId, config, rng);
    return { action: { type: "RollDice", playerId }, nextRng: rng };
  }

  if (state.turnPhase === "awaiting-tile-decision") {
    return decideTileAction(state, playerId, config, rng);
  }

  if (state.turnPhase === "awaiting-auction") {
    return decideAuctionAction(state, playerId, config, rng);
  }

  if (state.turnPhase === "resolving-debt") {
    return decideDebtResolution(state, playerId, config, rng);
  }

  if (state.turnPhase === "turn-idle") {
    return decideTurnIdleAction(state, playerId, config, rng);
  }

  throw new Error(`chooseAiAction: no decision defined for turnPhase ${state.turnPhase}`);
}

/**
 * Raise cash to cover a pending debt with the least strategic damage:
 * settle once affordable, otherwise mortgage the least-valuable building-free
 * property first, and only sell buildings when nothing else can be mortgaged.
 * (The engine only enters this phase when the debt is actually survivable.)
 */
function decideDebtResolution(
  state: GameState,
  playerId: string,
  config: AiConfig,
  rng: RngState,
): AiDecision {
  const debt = state.pendingDebt;
  const player = state.players.find((p) => p.id === playerId);
  if (!debt || !player) return { action: { type: "DeclareBankruptcy", playerId }, nextRng: rng };

  if (player.cash >= debt.amount) {
    return { action: { type: "SettleDebt", playerId }, nextRng: rng };
  }

  const owned = propertiesOwnedBy(state, playerId);
  const mortgageable = owned
    .filter((pos) => {
      const o = ownershipAt(state, pos);
      return o && !o.isMortgaged && o.houses === 0 && !o.hasHotel;
    })
    .sort(
      (a, b) =>
        propertyValue(state, playerId, a, config.personality) -
        propertyValue(state, playerId, b, config.personality),
    );
  if (mortgageable.length > 0) {
    return {
      action: { type: "MortgageProperty", playerId, position: mortgageable[0]! },
      nextRng: rng,
    };
  }

  // Sell a building — but respect even-building (only the most-developed tile
  // in a group is sellable when that house rule is on).
  const built = owned.find((pos) => {
    const o = ownershipAt(state, pos);
    return o && (o.houses > 0 || o.hasHotel) && canSellEvenly(state, playerId, pos);
  });
  if (built !== undefined) {
    return { action: { type: "SellHouse", playerId, position: built }, nextRng: rng };
  }

  return { action: { type: "DeclareBankruptcy", playerId }, nextRng: rng };
}

/** How dangerous the board is *to this player* — the developed rent traps that
 *  landing on could ruin them. A hotel counts most; houses add up. Own and
 *  mortgaged tiles don't threaten you. Used to decide whether jail is a refuge. */
function boardRentDanger(state: GameState, playerId: string): number {
  let danger = 0;
  for (const tile of BOARD) {
    if (tile.type !== "property") continue;
    const o = ownershipAt(state, tile.position);
    if (!o || !o.ownerId || o.ownerId === playerId || o.isMortgaged) continue;
    danger += o.hasHotel ? 3 : o.houses;
  }
  return danger;
}

function decideJailAction(
  state: GameState,
  playerId: string,
  config: AiConfig,
  rng: RngState,
): AiDecision {
  const player = state.players.find((p) => p.id === playerId)!;
  const { aggression, riskAppetite, cashReserveTarget } = config.personality;

  // Jail as strategy: once rivals' boards are hot (lots of built rent traps), a
  // cautious AI would rather sit tight than roll into a hotel. It skips both
  // bail and its jail-free card — staying put and keeping the card for later.
  // (The 3-turn jail limit still forces it out eventually, so it can't hide
  // forever.) A bold personality shrugs this off and plays on.
  const wantsToHide = boardRentDanger(state, playerId) >= 4 && riskAppetite < 0.7;
  if (wantsToHide) {
    return { action: { type: "RollDice", playerId }, nextRng: rng };
  }

  if (player.jailFreeCards > 0) {
    return { action: { type: "UseJailFreeCard", playerId }, nextRng: rng };
  }

  const eagerness = (aggression + riskAppetite) / 2;
  const canPayComfortably = player.cash - JAIL_BAIL_COST >= cashReserveTarget;
  const draw = nextFloat(rng);

  if (canPayComfortably && draw.value < eagerness) {
    return { action: { type: "PayBail", playerId }, nextRng: draw.nextState };
  }
  return { action: { type: "RollDice", playerId }, nextRng: draw.nextState };
}

function decideTileAction(
  state: GameState,
  playerId: string,
  config: AiConfig,
  rng: RngState,
): AiDecision {
  const player = state.players.find((p) => p.id === playerId)!;
  const position = player.position;
  const tile = getTile(position);
  const price = isOwnable(tile) ? tile.price : Infinity;

  const canAfford = player.cash >= price;
  const value = propertyValue(state, playerId, position, config.personality);
  const modelSaysBuy = canAfford && value > 0;

  const draw = nextFloat(rng);
  const takesModelAnswer = draw.value < config.skillLevel;
  const decision = takesModelAnswer ? modelSaysBuy : canAfford && draw.value < 0.5;

  const action: Action = decision
    ? { type: "BuyProperty", playerId, position }
    : { type: "DeclineProperty", playerId, position };
  return { action, nextRng: draw.nextState };
}

function decideAuctionAction(
  state: GameState,
  playerId: string,
  config: AiConfig,
  rng: RngState,
): AiDecision {
  const auction = state.pendingAuction!;
  const player = state.players.find((p) => p.id === playerId)!;
  const nextBid = auction.highestBid + 10;

  const ceiling = maxAuctionBid(state, playerId, auction.position, config.personality);
  const draw = nextFloat(rng);
  const modelSaysBid = nextBid <= ceiling && player.cash >= nextBid;
  const takesModelAnswer = draw.value < config.skillLevel;
  const decision = takesModelAnswer ? modelSaysBid : player.cash >= nextBid && draw.value < 0.3;

  const action: Action = decision
    ? { type: "PlaceBid", playerId, amount: nextBid }
    : { type: "PassAuction", playerId };
  return { action, nextRng: draw.nextState };
}

function decideTurnIdleAction(
  state: GameState,
  playerId: string,
  config: AiConfig,
  rng: RngState,
): AiDecision {
  const pendingTrade = state.pendingTrade;
  if (pendingTrade && pendingTrade.recipientId === playerId) {
    const accept = evaluateTradeAcceptance(state, playerId, pendingTrade, config.personality);
    const action: Action = accept
      ? { type: "AcceptTrade", playerId, tradeId: pendingTrade.id }
      : { type: "RejectTrade", playerId, tradeId: pendingTrade.id };
    return { action, nextRng: rng };
  }

  // Manage the bank loan before spending: borrow to catch up when trailing and
  // broke, or pay down an outstanding (interest-bearing) loan when flush.
  const loanAction = decideLoan(state, playerId, config);
  if (loanAction) return { action: loanAction, nextRng: rng };

  const buildTarget = findBestBuildTarget(state, playerId, config.personality);
  if (buildTarget !== null) {
    return { action: { type: "BuildHouse", playerId, position: buildTarget }, nextRng: rng };
  }

  return { action: { type: "EndTurn", playerId }, nextRng: rng };
}

/**
 * The AI's bank-loan move, if any. When it already owes, it deleverages —
 * repaying toward its reserve, since the debt accrues interest and drags net
 * worth. Otherwise, a trailing, cash-starved, risk-tolerant AI borrows a small
 * amount to get back in the game (the cautious miser stays debt-free, in
 * character). Only ever taken between turns, which is when this is consulted.
 */
function decideLoan(state: GameState, playerId: string, config: AiConfig): Action | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return null;
  const { cashReserveTarget, riskAppetite } = config.personality;

  if (player.loan) {
    const spare = player.cash - cashReserveTarget;
    if (spare <= 0) return null;
    return { type: "RepayLoan", playerId, amount: Math.min(spare, player.loan.owed) };
  }

  if (riskAppetite < 0.4) return null; // debt-averse personalities don't borrow
  if (player.cash >= cashReserveTarget) return null; // only when actually cash-starved
  const cap = loanCap(state, playerId);
  if (cap <= 0) return null; // not trailing / not eligible
  // Borrow just enough to restore the reserve, never overshooting (which would
  // trigger an immediate repay next turn).
  const amount = Math.min(cap, cashReserveTarget - player.cash);
  if (amount <= 0) return null;
  return { type: "TakeLoan", playerId, amount };
}

/**
 * The AI's accept/reject decision for a trade currently addressed to it,
 * usable independently of turn order (the UI drives this as soon as an offer
 * lands, rather than waiting for the AI's own turn). Returns null if there's
 * no pending trade for this player. Uses the same valuation as in-turn play.
 */
export function decideTradeResponse(
  state: GameState,
  playerId: string,
  config: AiConfig,
): Action | null {
  const trade = state.pendingTrade;
  if (!trade || trade.recipientId !== playerId) return null;
  const accept = evaluateTradeAcceptance(state, playerId, trade, config.personality);
  return accept
    ? { type: "AcceptTrade", playerId, tradeId: trade.id }
    : { type: "RejectTrade", playerId, tradeId: trade.id };
}

/**
 * The AI's outgoing offer, if it has a worthwhile one right now: a cash bid
 * for a rival's property that advances a color group it already has a foothold
 * in (finishing a set is the biggest swing in the game). Returns null when
 * nothing is worth offering. Pure and deterministic — the *timing* of proposals
 * (how often, and never mid-pending-trade) is the driver's concern, mirroring
 * how decideTradeResponse is invoked. The offer is always deliverable: the cash
 * stays within the proposer's reserve, and the target is building-free.
 */
export function decideTradeProposal(
  state: GameState,
  proposerId: string,
  config: AiConfig,
): Action | null {
  if (state.pendingTrade) return null;
  const proposer = state.players.find((p) => p.id === proposerId);
  if (!proposer) return null;

  // Prefer finishing our own set (cash for a rival's property); if we can't —
  // usually because we're cash-starved — fall back to dumping a dead asset (a
  // property a rival needs to complete *their* set) for cash.
  return (
    findAcquireOffer(state, proposerId, config.personality) ??
    findDeadAssetSale(state, proposerId, config.personality)
  );
}

/** A cash bid for a rival's building-free property that advances a color group
 *  we've already started. Capped to stay within our reserve, so it's always
 *  payable. Null when we've no spare cash or no worthwhile target. */
function findAcquireOffer(
  state: GameState,
  proposerId: string,
  personality: PersonalityParams,
): Action | null {
  const proposer = state.players.find((p) => p.id === proposerId);
  if (!proposer) return null;
  const reserveFloor = personality.cashReserveTarget * (1 - personality.aggression);
  const spendable = proposer.cash - reserveFloor;
  if (spendable <= 0) return null;

  let best: { position: number; ownerId: string; value: number } | null = null;
  for (const tile of BOARD) {
    if (tile.type !== "property") continue;
    const ownership = ownershipAt(state, tile.position);
    if (!ownership || !ownership.ownerId || ownership.ownerId === proposerId) continue;
    if (ownership.houses > 0 || ownership.hasHotel) continue; // built props can't be traded
    const foothold = propertiesInGroup(tile.group).some(
      (p) => ownerOf(state, p.position) === proposerId,
    );
    if (!foothold) continue;
    const value = propertyValue(state, proposerId, tile.position, personality);
    if (value <= 0) continue;
    if (!best || value > best.value) {
      best = { position: tile.position, ownerId: ownership.ownerId, value };
    }
  }
  if (!best) return null;

  const tile = getTile(best.position);
  if (tile.type !== "property") return null; // narrowing; best is always a property
  const premium = 1.1 + personality.aggression * 0.4; // 1.1x–1.5x
  const offer = Math.min(Math.round(tile.price * premium), Math.floor(spendable));
  if (offer < tile.price) return null; // a lowball just gets rejected — don't bother

  return {
    type: "ProposeTrade",
    proposerId,
    recipientId: best.ownerId,
    proposerGives: { cash: offer, propertyPositions: [] },
    recipientGives: { cash: 0, propertyPositions: [best.position] },
  };
}

/**
 * Sell a "dead asset" — one of our building-free properties whose color group a
 * single rival otherwise controls, so we'll never monopolize it but they'd
 * complete their set by buying it — to that rival for a cash premium. Spiteful
 * personalities hoard such blockers instead (handing a rival their monopoly is
 * against their nature). The ask is capped by the buyer's cash so it's payable.
 */
function findDeadAssetSale(
  state: GameState,
  proposerId: string,
  personality: PersonalityParams,
): Action | null {
  if (personality.spite >= 0.5) return null;

  let best: { position: number; buyerId: string; ask: number } | null = null;
  for (const tile of BOARD) {
    if (tile.type !== "property") continue;
    const ownership = ownershipAt(state, tile.position);
    if (!ownership || ownership.ownerId !== proposerId) continue;
    if (ownership.houses > 0 || ownership.hasHotel || ownership.isMortgaged) continue;

    const group = propertiesInGroup(tile.group);
    const others = group.filter((p) => p.position !== tile.position);
    const otherOwners = new Set(others.map((p) => ownerOf(state, p.position)));
    // Dead to us: every other member owned by one and the same rival.
    if (otherOwners.size !== 1) continue;
    const buyerId = [...otherOwners][0];
    if (!buyerId || buyerId === proposerId) continue;
    const buyer = state.players.find((p) => p.id === buyerId);
    if (!buyer || buyer.isBankrupt) continue;

    // They value the monopoly, so ask a premium — but never more than they can
    // pay, and only if it beats just mortgaging the tile ourselves.
    const premium = Math.round(tile.price * (1.3 + personality.aggression * 0.3));
    const ask = Math.min(premium, buyer.cash);
    if (ask < tile.mortgageValue) continue;
    if (!best || ask > best.ask) best = { position: tile.position, buyerId, ask };
  }
  if (!best) return null;

  return {
    type: "ProposeTrade",
    proposerId,
    recipientId: best.buyerId,
    proposerGives: { cash: 0, propertyPositions: [best.position] },
    recipientGives: { cash: best.ask, propertyPositions: [] },
  };
}

/** What the AI treats a jail-free card as worth in a trade — the bail it
 *  spares, plus a little option value for dodging jail entirely. */
const JAIL_FREE_CARD_VALUE = Math.round(JAIL_BAIL_COST * 1.2);

function assetsWorth(
  state: GameState,
  playerId: string,
  assets: TradeOffer["proposerGives"],
  personality: PersonalityParams,
): number {
  return (
    assets.cash +
    (assets.jailFreeCards ?? 0) * JAIL_FREE_CARD_VALUE +
    assets.propertyPositions.reduce(
      (sum, pos) => sum + Math.max(0, propertyValue(state, playerId, pos, personality)),
      0,
    )
  );
}

function evaluateTradeAcceptance(
  state: GameState,
  playerId: string,
  trade: TradeOffer,
  personality: PersonalityParams,
): boolean {
  const receiveValue = assetsWorth(state, playerId, trade.proposerGives, personality);
  const giveValue = assetsWorth(state, playerId, trade.recipientGives, personality);

  const acceptanceMargin = giveValue * (1 - personality.tradeFriendliness * 0.3);
  return receiveValue >= acceptanceMargin;
}

function findBestBuildTarget(
  state: GameState,
  playerId: string,
  personality: PersonalityParams,
): number | null {
  const player = state.players.find((p) => p.id === playerId)!;
  const owned = propertiesOwnedBy(state, playerId);

  let best: { position: number; value: number } | null = null;

  for (const position of owned) {
    const tile = getTile(position);
    if (tile.type !== "property") continue;

    const ownership = ownershipAt(state, position);
    if (!ownership || ownership.hasHotel) continue;

    if (!canBuildOnProperty(state, playerId, position)) continue;

    const reserveFloor = personality.cashReserveTarget * (1 - personality.aggression);
    if (player.cash - tile.buildingCost < reserveFloor) continue;

    const value = propertyValue(state, playerId, position, personality);
    if (!best || value > best.value) {
      best = { position, value };
    }
  }

  return best?.position ?? null;
}
