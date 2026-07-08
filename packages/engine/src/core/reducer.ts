import type { Action, ActionResult, GameEvent, GameState, PendingDebt } from "./types.js";
import { accept, reject } from "./types.js";
import { createRngState, rollDice as rngRollDice } from "../rng/index.js";
import {
  BOARD,
  BOARD_SIZE,
  getTile,
  isOwnable,
  JAIL_BAIL_COST,
  DEFAULT_HOUSE_RULES,
  HOUSE_SUPPLY,
  HOTEL_SUPPLY,
  LOAN_INTEREST_PER_ROUND,
  type HouseRules,
  type ModeConfig,
} from "../economy/index.js";
import {
  canAfford,
  handleBankruptcy,
  computeTax,
  movePlayer,
  ownerOf,
  ownershipAt,
  propertiesOwnedBy,
  payFromBank,
  payToBank,
  purchaseProperty,
  releaseFromJail,
  requirePlayer,
  sendToJail,
  addBuilding,
  removeBuilding,
  setBuildingState,
  mortgageProperty,
  unmortgageProperty,
  calculateRent,
  canBuildOnProperty,
  canBuildEvenly,
  canSellEvenly,
  payBetweenPlayers,
  payToPot,
  collectFreeParkingPot,
  checkWinCondition,
  startAuction,
  placeBid as rulesPlaceBid,
  passAuction as rulesPassAuction,
  proposeTrade as rulesProposeTrade,
  acceptTrade as rulesAcceptTrade,
  rejectTrade as rulesRejectTrade,
  loanCap,
} from "../rules/index.js";
import { CHANCE_TABLE, FUNNY_TABLE, applyEventEffect, type EventOutcome } from "../events/index.js";

export function createInitialState(
  seed: string,
  mode: ModeConfig,
  playerIds: readonly string[],
  houseRules: HouseRules = DEFAULT_HOUSE_RULES,
): GameState {
  if (playerIds.length < 2 || playerIds.length > 5) {
    throw new Error("createInitialState: AadesiPo supports 2-5 players");
  }
  return {
    seed,
    rng: createRngState(seed),
    mode,
    houseRules,
    players: playerIds.map((id) => ({
      id,
      cash: houseRules.startingCash,
      position: 0,
      inJail: false,
      jailTurnsRemaining: 0,
      jailFreeCards: 0,
      isBankrupt: false,
      loan: null,
    })),
    currentPlayerIndex: 0,
    properties: {},
    bank: 1_000_000_000,
    freeParkingPot: 0,
    buildingSupply: houseRules.finiteBuildings
      ? { houses: HOUSE_SUPPLY, hotels: HOTEL_SUPPLY }
      : null,
    turnPhase: "awaiting-roll",
    roundNumber: 0,
    doublesStreak: 0,
    pendingAuction: null,
    pendingTrade: null,
    tradeSeq: 0,
    pendingDebt: null,
    winnerId: null,
  };
}

function currentPlayerId(state: GameState): string {
  const player = state.players[state.currentPlayerIndex];
  if (!player) throw new Error("currentPlayerId: invalid currentPlayerIndex");
  return player.id;
}

/**
 * The one correct way to know whose action is expected next. This is
 * NOT always the current player by turn order — during an auction, it's
 * whoever's turn it is to bid, which can be any non-bankrupt player.
 * Both the AI adapter (ai/policy.ts) and any future UI turn-indicator
 * should call this rather than reading currentPlayerIndex directly.
 */
export function getActingPlayerId(state: GameState): string {
  if (state.turnPhase === "awaiting-auction" && state.pendingAuction) {
    return state.pendingAuction.turnBidderId;
  }
  return currentPlayerId(state);
}

function requireCurrentPlayer(state: GameState, playerId: string): string | null {
  if (state.turnPhase === "game-over") return "The game has already ended";
  if (currentPlayerId(state) !== playerId) return "It is not this player's turn";
  return null;
}

/**
 * The single entry point. Same inputs -> same outputs, always — this is
 * what makes the engine replayable, server-validatable, and testable.
 */
export function applyAction(state: GameState, action: Action): ActionResult {
  switch (action.type) {
    case "RollDice":
      return handleRollDice(state, action.playerId);
    case "PayBail":
      return handlePayBail(state, action.playerId);
    case "UseJailFreeCard":
      return handleUseJailFreeCard(state, action.playerId);
    case "BuyProperty":
      return handleBuyProperty(state, action.playerId, action.position);
    case "DeclineProperty":
      return handleDeclineProperty(state, action.playerId, action.position);
    case "PlaceBid": {
      const result = rulesPlaceBid(state, action.playerId, action.amount);
      if ("error" in result) return reject(result.error);
      const [s, e] = withDoublesAwareAuctionPhase(result.state, result.events);
      return accept(s, e);
    }
    case "PassAuction": {
      const result = rulesPassAuction(state, action.playerId);
      if ("error" in result) return reject(result.error);
      const [s, e] = withDoublesAwareAuctionPhase(result.state, result.events);
      return accept(s, e);
    }
    case "SellProperty":
      return handleSellProperty(state, action.playerId, action.position);
    case "MortgageProperty":
      return handleMortgage(state, action.playerId, action.position);
    case "UnmortgageProperty":
      return handleUnmortgage(state, action.playerId, action.position);
    case "BuildHouse":
      return handleBuildHouse(state, action.playerId, action.position);
    case "SellHouse":
      return handleSellHouse(state, action.playerId, action.position);
    case "ProposeTrade": {
      const result = rulesProposeTrade(
        state,
        action.proposerId,
        action.recipientId,
        action.proposerGives,
        action.recipientGives,
      );
      if ("error" in result) return reject(result.error);
      return accept(result.state, result.events);
    }
    case "AcceptTrade": {
      const result = rulesAcceptTrade(state, action.playerId, action.tradeId);
      if ("error" in result) return reject(result.error);
      return accept(result.state, result.events);
    }
    case "RejectTrade": {
      const result = rulesRejectTrade(state, action.playerId, action.tradeId);
      if ("error" in result) return reject(result.error);
      return accept(result.state, result.events);
    }
    case "DeclareBankruptcy": {
      const turnError = requireCurrentPlayer(state, action.playerId);
      if (turnError) return reject(turnError);
      // If bankrupting out of a debt, the creditor (not the bank) inherits.
      const creditorId =
        state.pendingDebt?.debtorId === action.playerId ? state.pendingDebt.creditorId : null;
      const result = handleBankruptcy(state, action.playerId, creditorId);
      return finishBankruptcyAndCheckWin(result.state, [...result.events]);
    }
    case "SettleDebt":
      return handleSettleDebt(state, action.playerId);
    case "TakeLoan":
      return handleTakeLoan(state, action.playerId, action.amount);
    case "RepayLoan":
      return handleRepayLoan(state, action.playerId, action.amount);
    case "EndTurn":
      return handleEndTurn(state, action.playerId);
  }
}

// ---------------------------------------------------------------------

function withDoublesAwareAuctionPhase(
  state: GameState,
  events: readonly GameEvent[],
): [GameState, readonly GameEvent[]] {
  // Only a resolved bank auction (which lands on turn-idle) grants a doubles
  // re-roll. A resolved sale restores its own returnPhase (turn-idle or
  // resolving-debt) and must not be overridden.
  if (!state.pendingAuction && state.turnPhase === "turn-idle" && state.doublesStreak > 0) {
    return [{ ...state, turnPhase: "awaiting-roll" }, events];
  }
  return [state, events];
}

function postTileResolutionPhase(state: GameState): GameState["turnPhase"] {
  return state.doublesStreak > 0 ? "awaiting-roll" : "turn-idle";
}

function handleRollDice(state: GameState, playerId: string): ActionResult {
  const turnError = requireCurrentPlayer(state, playerId);
  if (turnError) return reject(turnError);
  if (state.turnPhase !== "awaiting-roll") return reject("Not awaiting a roll right now");

  const player = requirePlayer(state, playerId);
  const roll = rngRollDice(state.rng);
  const diceSum = roll.die1 + roll.die2;
  let next: GameState = { ...state, rng: roll.nextState };
  const events: GameEvent[] = [{ type: "DiceRolled", playerId, die1: roll.die1, die2: roll.die2 }];

  if (player.inJail) {
    if (roll.isDoubles) {
      next = releaseFromJail(next, playerId);
      events.push({ type: "ReleasedFromJail", playerId, via: "doubles" });
      next = { ...next, doublesStreak: 0 };
      return resolveMovementAndTile(next, playerId, diceSum, events);
    }

    const turnsLeft = player.jailTurnsRemaining - 1;
    if (turnsLeft > 0) {
      next = {
        ...next,
        players: next.players.map((p) =>
          p.id === playerId ? { ...p, jailTurnsRemaining: turnsLeft } : p,
        ),
        turnPhase: "turn-idle",
      };
      return accept(next, events);
    }

    if (!canAfford(player, JAIL_BAIL_COST)) {
      return enterDebtOrBankrupt(
        next,
        playerId,
        JAIL_BAIL_COST,
        null,
        "jail-bail",
        { diceSum },
        events,
      );
    }
    next = payToBank(next, playerId, JAIL_BAIL_COST);
    next = releaseFromJail(next, playerId);
    events.push({ type: "ReleasedFromJail", playerId, via: "bail" });
    next = { ...next, doublesStreak: 0 };
    return resolveMovementAndTile(next, playerId, diceSum, events);
  }

  if (roll.isDoubles) {
    const streak = state.doublesStreak + 1;
    if (streak >= 3) {
      next = sendToJail(next, playerId);
      next = { ...next, doublesStreak: 0, turnPhase: "turn-idle" };
      events.push({ type: "SentToJail", playerId });
      return accept(next, events);
    }
    next = { ...next, doublesStreak: streak };
  } else {
    next = { ...next, doublesStreak: 0 };
  }

  return resolveMovementAndTile(next, playerId, diceSum, events);
}

/** The Chance/Funny outcome tables the event resolver reads. Kept as an
 *  injectable parameter (rather than reaching for the module constants
 *  directly) purely so the recursion-depth guard below can be exercised
 *  in a test with a deliberately looping table. */
export interface EventTables {
  readonly chance: Readonly<Record<number, EventOutcome>>;
  readonly funny: Readonly<Record<number, EventOutcome>>;
}

export const DEFAULT_EVENT_TABLES: EventTables = { chance: CHANCE_TABLE, funny: FUNNY_TABLE };

/**
 * A single turn's event chain is provably finite for the shipped tables
 * (a movement outcome resolves to at most one further event, i.e. depth
 * 2). This cap is a backstop against a *future* edit to CHANCE_TABLE /
 * FUNNY_TABLE that accidentally introduces a longer or cyclic chain: it
 * turns a silent hang into a loud, diagnosable throw. It is not expected
 * to ever fire in normal play.
 */
export const MAX_EVENT_CHAIN_DEPTH = 3;

function resolveMovementAndTile(
  state: GameState,
  playerId: string,
  diceSum: number,
  events: GameEvent[],
): ActionResult {
  const moveResult = movePlayer(state, playerId, diceSum);
  events.push(...moveResult.events);
  return resolveLandedTile(moveResult.state, playerId, diceSum, events);
}

/**
 * Fully resolves whatever tile the player is now standing on — rent,
 * purchase/auction prompt, tax, or an event-table lookup. Split out from
 * movement so that event-driven movement (advance to nearest transit, go
 * back N spaces) can reuse the exact same landing resolution, ensuring an
 * event that lands you on a property triggers rent/purchase identically
 * to a normal roll. `diceSum` is the sum of the roll that started the
 * turn — carried through so utility rent (and any chained event lookup)
 * matches "as if you had rolled here".
 */
export function resolveLandedTile(
  state: GameState,
  playerId: string,
  diceSum: number,
  events: GameEvent[],
  depth = 0,
  tables: EventTables = DEFAULT_EVENT_TABLES,
): ActionResult {
  if (depth > MAX_EVENT_CHAIN_DEPTH) {
    throw new Error(
      `resolveLandedTile: event chain exceeded the safety cap of ${MAX_EVENT_CHAIN_DEPTH} ` +
        `recursions in a single turn (dice sum ${diceSum}). A movement outcome in ` +
        `CHANCE_TABLE/FUNNY_TABLE likely forms a longer-than-expected or cyclic chain.`,
    );
  }

  const player = requirePlayer(state, playerId);
  if (player.inJail) {
    return accept({ ...state, turnPhase: "turn-idle" }, events);
  }

  const tile = getTile(player.position);
  let next = state;

  if (isOwnable(tile)) {
    const ownership = ownershipAt(next, tile.position);
    if (!ownership || !ownership.ownerId) {
      return accept({ ...next, turnPhase: "awaiting-tile-decision" }, events);
    }
    if (ownership.ownerId !== playerId && !ownership.isMortgaged) {
      const rent = calculateRent(next, tile.position, diceSum);
      if (!canAfford(player, rent)) {
        return enterDebtOrBankrupt(
          next,
          playerId,
          rent,
          ownership.ownerId,
          "rent",
          { position: tile.position },
          events,
        );
      }
      next = payBetweenPlayers(next, playerId, ownership.ownerId, rent);
      events.push({
        type: "RentPaid",
        fromId: playerId,
        toId: ownership.ownerId,
        amount: rent,
        position: tile.position,
      });
    }
    return accept({ ...next, turnPhase: postTileResolutionPhase(next) }, events);
  }

  if (tile.type === "tax") {
    // Dynamic: the bill scales with what the landing player owns (see computeTax).
    const taxDue = computeTax(next, playerId, tile.variant);
    if (!canAfford(player, taxDue)) {
      return enterDebtOrBankrupt(next, playerId, taxDue, null, "tax", {}, events);
    }
    next = payTax(next, playerId, taxDue);
    events.push({ type: "TaxPaid", playerId, amount: taxDue });
    return accept({ ...next, turnPhase: postTileResolutionPhase(next) }, events);
  }

  if (tile.type === "chance" || tile.type === "funny-event") {
    return resolveEventTile(next, playerId, tile.type, diceSum, events, depth, tables);
  }

  // Free Parking pays out the accrued jackpot (house rule only; the pot is
  // otherwise always 0, so this is a no-op under classic rules).
  if (tile.type === "free-parking" && next.freeParkingPot > 0) {
    const amount = next.freeParkingPot;
    next = collectFreeParkingPot(next, playerId);
    events.push({ type: "JackpotCollected", playerId, amount });
    return accept({ ...next, turnPhase: postTileResolutionPhase(next) }, events);
  }

  return accept({ ...next, turnPhase: postTileResolutionPhase(next) }, events);
}

/** Tax leaves the player. Under the Free-Parking-jackpot house rule it lands
 *  in the pot (collected on Free Parking) rather than disappearing into the
 *  bank; otherwise it goes to the bank as usual. */
function payTax(state: GameState, playerId: string, amount: number): GameState {
  return state.houseRules.freeParkingJackpot
    ? payToPot(state, playerId, amount)
    : payToBank(state, playerId, amount);
}

const TRANSIT_POSITIONS: readonly number[] = BOARD.filter((t) => t.type === "transit").map(
  (t) => t.position,
);

/** Spaces forward from `from` to the next transit tile (never 0). */
function spacesToNearestTransit(from: number): number {
  for (let d = 1; d <= BOARD_SIZE; d++) {
    if (TRANSIT_POSITIONS.includes((from + d) % BOARD_SIZE)) return d;
  }
  throw new Error("spacesToNearestTransit: board has no transit tiles");
}

/**
 * Resolves a Chance / Funny-Event tile deterministically from the dice
 * sum (2-12) — no random draw. Cash outcomes are applied directly; the
 * movement outcomes move the player and then recursively resolve the
 * landed tile via resolveLandedTile, so rent/purchase/tax (or even a
 * chained event) fire exactly as a normal landing would.
 */
function resolveEventTile(
  state: GameState,
  playerId: string,
  tileType: "chance" | "funny-event",
  diceSum: number,
  events: GameEvent[],
  depth: number,
  tables: EventTables,
): ActionResult {
  const table = tileType === "chance" ? tables.chance : tables.funny;
  const outcome = table[diceSum];
  if (!outcome) {
    throw new Error(`resolveEventTile: no outcome for dice sum ${diceSum}`);
  }
  const cardBase = {
    type: "EventCardResolved" as const,
    playerId,
    deck: (tileType === "chance" ? "chance" : "funny") as "chance" | "funny",
    diceSum,
    text: outcome.text,
  };

  const effect = outcome.effect;

  // Pure cash cards: apply the effect first, then report the drawing player's
  // net change right on the card line — several collect-* effects emit no other
  // event, so without this the log would say a card resolved but never how much
  // money moved.
  switch (effect.kind) {
    case "pay-bank":
    case "collect-from-bank":
    case "collect-from-each-player":
    case "pay-each-player":
    case "street-repairs":
    case "collect-per-property": {
      const before = requirePlayer(state, playerId).cash;
      const result = applyEventEffect(state, playerId, effect);
      const after = requirePlayer(result.state, playerId).cash;
      events.push({ ...cardBase, cashDelta: after - before });
      events.push(...result.events);
      return accept({ ...result.state, turnPhase: postTileResolutionPhase(result.state) }, events);
    }
  }

  // Movement / jail / jail-free cards carry no direct cash delta of their own
  // (any rent or purchase where they land shows as its own log line).
  events.push(cardBase);

  switch (effect.kind) {
    case "advance-to-nearest-transit": {
      const from = requirePlayer(state, playerId).position;
      const moveResult = movePlayer(state, playerId, spacesToNearestTransit(from));
      events.push(...moveResult.events);
      return resolveLandedTile(moveResult.state, playerId, diceSum, events, depth + 1, tables);
    }
    case "advance-to-tile": {
      // Always move forward to the target tile (wrapping past GO if needed),
      // then resolve it exactly as a normal landing — rent, purchase, etc.
      const from = requirePlayer(state, playerId).position;
      const to = ((effect.position % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
      const raw = (to - from + BOARD_SIZE) % BOARD_SIZE;
      const forward = raw === 0 ? BOARD_SIZE : raw;
      const moveResult = movePlayer(state, playerId, forward);
      events.push(...moveResult.events);
      return resolveLandedTile(moveResult.state, playerId, diceSum, events, depth + 1, tables);
    }
    case "move-back-n-spaces": {
      const moveResult = movePlayer(state, playerId, -effect.spaces);
      events.push(...moveResult.events);
      return resolveLandedTile(moveResult.state, playerId, diceSum, events, depth + 1, tables);
    }
    case "go-to-jail": {
      const next = sendToJail(state, playerId);
      events.push({ type: "SentToJail", playerId });
      return accept({ ...next, turnPhase: "turn-idle" }, events);
    }
    case "grant-jail-free-card": {
      const next: GameState = {
        ...state,
        players: state.players.map((p) =>
          p.id === playerId ? { ...p, jailFreeCards: p.jailFreeCards + 1 } : p,
        ),
      };
      return accept({ ...next, turnPhase: postTileResolutionPhase(next) }, events);
    }
  }
}

function handlePayBail(state: GameState, playerId: string): ActionResult {
  const turnError = requireCurrentPlayer(state, playerId);
  if (turnError) return reject(turnError);
  const player = requirePlayer(state, playerId);
  if (!player.inJail) return reject("Player is not in jail");
  if (!canAfford(player, JAIL_BAIL_COST)) return reject("Cannot afford bail");

  let next = payToBank(state, playerId, JAIL_BAIL_COST);
  next = releaseFromJail(next, playerId);
  next = { ...next, turnPhase: "awaiting-roll" };
  return accept(next, [{ type: "ReleasedFromJail", playerId, via: "bail" }]);
}

function handleUseJailFreeCard(state: GameState, playerId: string): ActionResult {
  const turnError = requireCurrentPlayer(state, playerId);
  if (turnError) return reject(turnError);
  const player = requirePlayer(state, playerId);
  if (!player.inJail) return reject("Player is not in jail");
  if (player.jailFreeCards <= 0) return reject("No jail-free cards available");

  let next: GameState = {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, jailFreeCards: p.jailFreeCards - 1 } : p,
    ),
  };
  next = releaseFromJail(next, playerId);
  next = { ...next, turnPhase: "awaiting-roll" };
  return accept(next, [{ type: "ReleasedFromJail", playerId, via: "card" }]);
}

function handleBuyProperty(state: GameState, playerId: string, position: number): ActionResult {
  const turnError = requireCurrentPlayer(state, playerId);
  if (turnError) return reject(turnError);
  if (state.turnPhase !== "awaiting-tile-decision") return reject("No purchase decision pending");

  const player = requirePlayer(state, playerId);
  if (player.position !== position) return reject("Player is not on this tile");

  const tile = getTile(position);
  if (!isOwnable(tile)) return reject("This tile cannot be purchased");
  const ownership = ownershipAt(state, position);
  if (ownership?.ownerId) return reject("This tile is already owned");

  const price = tile.price;
  if (!canAfford(player, price)) return reject("Cannot afford this property");

  let next = payToBank(state, playerId, price);
  next = purchaseProperty(next, playerId, position);
  next = { ...next, turnPhase: postTileResolutionPhase(next) };

  return accept(next, [{ type: "PropertyPurchased", playerId, position, price }]);
}

function handleDeclineProperty(state: GameState, playerId: string, position: number): ActionResult {
  const turnError = requireCurrentPlayer(state, playerId);
  if (turnError) return reject(turnError);
  if (state.turnPhase !== "awaiting-tile-decision") return reject("No purchase decision pending");

  const player = requirePlayer(state, playerId);
  if (player.position !== position) return reject("Player is not on this tile");

  const declined: GameEvent = { type: "PropertyDeclined", playerId, position };

  // No-auction house rule: a declined property simply stays unowned and the
  // turn resolves, rather than opening it up to the table.
  if (state.houseRules.noAuction) {
    return accept({ ...state, turnPhase: postTileResolutionPhase(state) }, [declined]);
  }

  const result = startAuction(state, position, playerId);
  return accept(result.state, [declined, ...result.events]);
}

/**
 * Put an owned property up for auction to the other players — a fund-raising
 * lever alongside mortgaging. Proceeds go to the seller; if nobody bids, they
 * keep it. Only building-free, unmortgaged property can be listed, and only on
 * the seller's own turn — before their roll, after the tile resolves, or while
 * raising funds for a debt (see SELLABLE_PHASES).
 */
const SELLABLE_PHASES: ReadonlySet<GameState["turnPhase"]> = new Set([
  "awaiting-roll", // manage the board before rolling
  "turn-idle", // after the tile has resolved
  "resolving-debt", // raising funds to cover a debt
]);

function handleSellProperty(state: GameState, playerId: string, position: number): ActionResult {
  const turnError = requireCurrentPlayer(state, playerId);
  if (turnError) return reject(turnError);
  if (!SELLABLE_PHASES.has(state.turnPhase)) {
    return reject("You can only sell a property on your own turn");
  }
  if (ownerOf(state, position) !== playerId) return reject("Player does not own this property");

  const tile = getTile(position);
  if (!isOwnable(tile)) return reject("This tile cannot be sold");

  const ownership = ownershipAt(state, position);
  if (!ownership) return reject("Property is not owned");
  if (ownership.houses > 0 || ownership.hasHotel) {
    return reject("Sell the buildings on this property first");
  }
  if (ownership.isMortgaged) return reject("Unmortgage this property before selling it");

  const hasBidder = state.players.some((p) => !p.isBankrupt && p.id !== playerId);
  if (!hasBidder) return reject("No one else is in the game to bid");

  const result = startAuction(state, position, playerId, {
    sellerId: playerId,
    returnPhase: state.turnPhase,
    reserve: tile.mortgageValue,
  });
  return accept(result.state, result.events);
}

function handleMortgage(state: GameState, playerId: string, position: number): ActionResult {
  if (ownerOf(state, position) !== playerId) return reject("Player does not own this property");
  const ownership = ownershipAt(state, position);
  if (!ownership) return reject("No such property");
  if (ownership.isMortgaged) return reject("Already mortgaged");
  if (ownership.houses > 0 || ownership.hasHotel) {
    return reject("Sell buildings before mortgaging");
  }
  const tile = getTile(position);
  if (!isOwnable(tile)) return reject("This tile cannot be mortgaged");

  let next = mortgageProperty(state, position);
  next = payFromBank(next, playerId, tile.mortgageValue);
  return accept(next, [
    { type: "PropertyMortgaged", playerId, position, amount: tile.mortgageValue },
  ]);
}

function handleUnmortgage(state: GameState, playerId: string, position: number): ActionResult {
  if (ownerOf(state, position) !== playerId) return reject("Player does not own this property");
  const ownership = ownershipAt(state, position);
  if (!ownership) return reject("No such property");
  if (!ownership.isMortgaged) return reject("Not mortgaged");

  const tile = getTile(position);
  if (!isOwnable(tile)) return reject("This tile cannot be unmortgaged");
  const payoff = Math.round(tile.mortgageValue * 1.1);

  const player = requirePlayer(state, playerId);
  if (!canAfford(player, payoff)) return reject("Cannot afford the mortgage payoff");

  let next = payToBank(state, playerId, payoff);
  next = unmortgageProperty(next, position);
  return accept(next, [{ type: "PropertyUnmortgaged", playerId, position, amount: payoff }]);
}

function handleBuildHouse(state: GameState, playerId: string, position: number): ActionResult {
  if (ownerOf(state, position) !== playerId) return reject("Player does not own this property");
  const tile = getTile(position);
  if (tile.type !== "property") return reject("Only properties (not transit/utility) can build");

  const ownership = ownershipAt(state, position);
  if (ownership?.hasHotel) return reject("Already has a hotel");

  // Finite-supply check first, so an empty bank gives a precise reason rather
  // than the generic unlock message (canBuildOnProperty also gates on supply).
  const buildingHotel = ownership?.houses === 4;
  if (state.buildingSupply) {
    if (buildingHotel && state.buildingSupply.hotels < 1) {
      return reject("No hotels left in the bank");
    }
    if (!buildingHotel && state.buildingSupply.houses < 1) {
      return reject("No houses left in the bank");
    }
  }

  if (!canBuildEvenly(state, playerId, position)) {
    return reject("Build evenly — bring the rest of the colour group up first");
  }

  if (!canBuildOnProperty(state, playerId, position)) {
    return reject("Building unlock requires 17 of 22 color properties to be owned collectively");
  }

  const player = requirePlayer(state, playerId);
  if (!canAfford(player, tile.buildingCost)) return reject("Cannot afford this building");

  let next = payToBank(state, playerId, tile.buildingCost);
  next = addBuilding(next, position);
  // Building a hotel returns its 4 houses to the bank and consumes a hotel;
  // building a house just consumes a house.
  if (next.buildingSupply) {
    next = {
      ...next,
      buildingSupply: buildingHotel
        ? { houses: next.buildingSupply.houses + 4, hotels: next.buildingSupply.hotels - 1 }
        : { houses: next.buildingSupply.houses - 1, hotels: next.buildingSupply.hotels },
    };
  }
  const updated = ownershipAt(next, position);
  if (!updated) throw new Error("handleBuildHouse: ownership missing after addBuilding");
  return accept(next, [
    { type: "HouseBuilt", playerId, position, houses: updated.houses, hasHotel: updated.hasHotel },
  ]);
}

function handleSellHouse(state: GameState, playerId: string, position: number): ActionResult {
  if (ownerOf(state, position) !== playerId) return reject("Player does not own this property");
  const tile = getTile(position);
  if (tile.type !== "property") return reject("Only properties can sell buildings");

  const ownership = ownershipAt(state, position);
  if (!ownership || (ownership.houses === 0 && !ownership.hasHotel)) {
    return reject("No buildings to sell");
  }
  if (!canSellEvenly(state, playerId, position)) {
    return reject("Sell evenly — sell from a more-developed property first");
  }

  const refund = Math.round(tile.buildingCost / 2);
  const supply = state.buildingSupply;
  let next: GameState;

  if (supply && ownership.hasHotel) {
    // Breaking a hotel back into houses needs 4 from the bank; a housing
    // shortage leaves fewer placed (the rest simply stay in the bank), so the
    // pool count never goes negative. The hotel itself returns to the bank.
    const housesPlaced = Math.min(4, supply.houses);
    next = setBuildingState(state, position, housesPlaced, false);
    next = {
      ...next,
      buildingSupply: { houses: supply.houses - housesPlaced, hotels: supply.hotels + 1 },
    };
  } else {
    next = removeBuilding(state, position);
    // Selling a single house returns it to the bank's stock.
    if (supply) {
      next = { ...next, buildingSupply: { houses: supply.houses + 1, hotels: supply.hotels } };
    }
  }

  next = payFromBank(next, playerId, refund);
  const updated = ownershipAt(next, position);
  if (!updated) throw new Error("handleSellHouse: ownership missing after removeBuilding");
  return accept(next, [
    { type: "HouseSold", playerId, position, houses: updated.houses, hasHotel: updated.hasHotel },
  ]);
}

function finishBankruptcyAndCheckWin(state: GameState, events: GameEvent[]): ActionResult {
  const cleared: GameState = { ...state, pendingDebt: null };
  const win = checkWinCondition(cleared);
  if (win) {
    const finalState: GameState = { ...cleared, winnerId: win.winnerId, turnPhase: "game-over" };
    events.push({ type: "GameEnded", winnerId: win.winnerId, reason: win.reason });
    return accept(finalState, events);
  }
  return accept({ ...cleared, turnPhase: "turn-idle" }, events);
}

/** The most cash a player could raise by liquidating everything: current cash
 *  + mortgage value of each unmortgaged property + the sell-back value of all
 *  their buildings. Used to decide whether a debt is survivable at all. */
function maxRaisableCash(state: GameState, playerId: string): number {
  const player = requirePlayer(state, playerId);
  let total = player.cash;
  for (const position of propertiesOwnedBy(state, playerId)) {
    const ownership = ownershipAt(state, position);
    const tile = getTile(position);
    if (!ownership || !isOwnable(tile) || ownership.isMortgaged) continue;
    total += tile.mortgageValue;
    if (tile.type === "property") {
      const units = ownership.hasHotel ? 5 : ownership.houses;
      total += units * Math.round(tile.buildingCost / 2);
    }
  }
  return total;
}

/**
 * A payment the debtor can't cover in cash. If they could never cover it even
 * by liquidating everything, bankrupt them now (no point in a hopeless raise-
 * funds loop). Otherwise pause in "resolving-debt" so they can mortgage/sell
 * and then SettleDebt.
 */
function enterDebtOrBankrupt(
  state: GameState,
  debtorId: string,
  amount: number,
  creditorId: string | null,
  reason: PendingDebt["reason"],
  extra: { position?: number; diceSum?: number },
  events: GameEvent[],
): ActionResult {
  if (maxRaisableCash(state, debtorId) < amount) {
    const bankruptcy = handleBankruptcy(state, debtorId, creditorId);
    return finishBankruptcyAndCheckWin(bankruptcy.state, [...events, ...bankruptcy.events]);
  }
  const pendingDebt: PendingDebt = {
    debtorId,
    amount,
    creditorId,
    reason,
    ...(extra.position !== undefined ? { position: extra.position } : {}),
    ...(extra.diceSum !== undefined ? { diceSum: extra.diceSum } : {}),
  };
  events.push({ type: "DebtIncurred", playerId: debtorId, amount, creditorId });
  return accept({ ...state, pendingDebt, turnPhase: "resolving-debt" }, events);
}

/** Settle the pending debt once the debtor has enough cash — pays the creditor
 *  (or bank), then resumes whatever the debt interrupted. */
function handleSettleDebt(state: GameState, playerId: string): ActionResult {
  const turnError = requireCurrentPlayer(state, playerId);
  if (turnError) return reject(turnError);
  const debt = state.pendingDebt;
  if (!debt || debt.debtorId !== playerId || state.turnPhase !== "resolving-debt") {
    return reject("No debt to settle");
  }
  const player = requirePlayer(state, playerId);
  if (!canAfford(player, debt.amount)) return reject("Raise more cash before settling");

  let next = state;
  const events: GameEvent[] = [];
  if (debt.creditorId) {
    next = payBetweenPlayers(next, playerId, debt.creditorId, debt.amount);
    if (debt.reason === "rent") {
      events.push({
        type: "RentPaid",
        fromId: playerId,
        toId: debt.creditorId,
        amount: debt.amount,
        position: debt.position ?? player.position,
      });
    }
  } else {
    next =
      debt.reason === "tax"
        ? payTax(next, playerId, debt.amount)
        : payToBank(next, playerId, debt.amount);
    if (debt.reason === "tax") events.push({ type: "TaxPaid", playerId, amount: debt.amount });
  }
  next = { ...next, pendingDebt: null };

  if (debt.reason === "jail-bail") {
    next = releaseFromJail(next, playerId);
    events.push({ type: "ReleasedFromJail", playerId, via: "bail" });
    next = { ...next, doublesStreak: 0 };
    return resolveMovementAndTile(next, playerId, debt.diceSum ?? 0, events);
  }
  return accept({ ...next, turnPhase: postTileResolutionPhase(next) }, events);
}

/** Borrow cash from the bank against net worth — a catch-up lever for a
 *  trailing player. The amount is capped at a fraction of net worth; the debt
 *  (owed) then accrues interest each round until repaid. */
function handleTakeLoan(state: GameState, playerId: string, amount: number): ActionResult {
  const turnError = requireCurrentPlayer(state, playerId);
  if (turnError) return reject(turnError);
  if (state.turnPhase !== "turn-idle") return reject("Can only borrow between turns");

  const player = requirePlayer(state, playerId);
  if (player.loan) return reject("Repay your current loan before borrowing again");
  if (amount <= 0) return reject("Loan amount must be positive");

  const cap = loanCap(state, playerId);
  if (cap <= 0) return reject("You must be trailing to borrow from the bank");
  if (amount > cap) return reject(`You can borrow at most ${cap}`);

  let next = payFromBank(state, playerId, amount);
  next = {
    ...next,
    players: next.players.map((p) =>
      p.id === playerId ? { ...p, loan: { principal: amount, owed: amount } } : p,
    ),
  };
  return accept(next, [{ type: "LoanTaken", playerId, amount }]);
}

/** Repay part or all of an outstanding loan. Pays down `owed` (interest first
 *  in effect, since owed is a single balance); clears the loan when it hits 0. */
function handleRepayLoan(state: GameState, playerId: string, amount: number): ActionResult {
  const turnError = requireCurrentPlayer(state, playerId);
  if (turnError) return reject(turnError);
  if (state.turnPhase !== "turn-idle") return reject("Can only repay between turns");

  const player = requirePlayer(state, playerId);
  if (!player.loan) return reject("No loan to repay");
  if (amount <= 0) return reject("Repayment must be positive");
  if (!canAfford(player, amount)) return reject("Not enough cash to repay that much");

  const payment = Math.min(amount, player.loan.owed);
  const remaining = player.loan.owed - payment;

  let next = payToBank(state, playerId, payment);
  next = {
    ...next,
    players: next.players.map((p) =>
      p.id === playerId
        ? { ...p, loan: remaining > 0 ? { ...p.loan!, owed: remaining } : null }
        : p,
    ),
  };
  return accept(next, [{ type: "LoanRepaid", playerId, amount: payment, remaining }]);
}

/** Grows every outstanding loan by one round of simple interest on principal.
 *  Called on a round boundary; changes only the `owed` liability, never cash,
 *  so money stays conserved. */
function accrueLoanInterest(state: GameState): GameState {
  if (!state.players.some((p) => p.loan)) return state;
  return {
    ...state,
    players: state.players.map((p) =>
      p.loan
        ? {
            ...p,
            loan: {
              ...p.loan,
              owed: p.loan.owed + Math.round(p.loan.principal * LOAN_INTEREST_PER_ROUND),
            },
          }
        : p,
    ),
  };
}

function handleEndTurn(state: GameState, playerId: string): ActionResult {
  const turnError = requireCurrentPlayer(state, playerId);
  if (turnError) return reject(turnError);
  if (state.turnPhase !== "turn-idle") return reject("Cannot end turn yet");

  const { index: nextIndex, wrapped } = advanceToNextActivePlayer(state);
  const nextPlayer = state.players[nextIndex];
  if (!nextPlayer) return reject("No next player available");

  let next: GameState = {
    ...state,
    currentPlayerIndex: nextIndex,
    roundNumber: wrapped ? state.roundNumber + 1 : state.roundNumber,
    doublesStreak: 0,
    turnPhase: "awaiting-roll",
  };

  // A completed round ticks interest onto every outstanding loan.
  if (wrapped) next = accrueLoanInterest(next);

  const events: GameEvent[] = [{ type: "TurnEnded", playerId, nextPlayerId: nextPlayer.id }];

  const win = checkWinCondition(next);
  if (win) {
    next = { ...next, winnerId: win.winnerId, turnPhase: "game-over" };
    events.push({ type: "GameEnded", winnerId: win.winnerId, reason: win.reason });
  }

  return accept(next, events);
}

function advanceToNextActivePlayer(state: GameState): { index: number; wrapped: boolean } {
  const n = state.players.length;
  let wrapped = false;
  let idx = state.currentPlayerIndex;
  for (let i = 0; i < n; i++) {
    idx += 1;
    if (idx >= n) {
      idx = 0;
      wrapped = true;
    }
    if (!state.players[idx]?.isBankrupt) {
      return { index: idx, wrapped };
    }
  }
  return { index: state.currentPlayerIndex, wrapped: false };
}
