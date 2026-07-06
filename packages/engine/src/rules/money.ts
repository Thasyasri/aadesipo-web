import type { GameState, PlayerState } from "../core/types.js";

/**
 * Every cash movement in the engine goes through one of these three
 * functions. That's deliberate: it's what makes "total money in the
 * system (bank + all players) is conserved across every action" a
 * property the test suite can actually check, rather than an aspiration.
 */

function updatePlayer(
  state: GameState,
  playerId: string,
  update: (p: PlayerState) => PlayerState,
): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? update(p) : p)),
  };
}

export function findPlayer(state: GameState, playerId: string): PlayerState | undefined {
  return state.players.find((p) => p.id === playerId);
}

export function requirePlayer(state: GameState, playerId: string): PlayerState {
  const player = findPlayer(state, playerId);
  if (!player) throw new Error(`requirePlayer: no player with id ${playerId}`);
  return player;
}

/** Bank -> player. Used for GO salary, chance/event payouts, etc. */
export function payFromBank(state: GameState, playerId: string, amount: number): GameState {
  if (amount < 0) throw new Error("payFromBank: amount must be >= 0");
  const withPlayer = updatePlayer(state, playerId, (p) => ({ ...p, cash: p.cash + amount }));
  return { ...withPlayer, bank: withPlayer.bank - amount };
}

/**
 * Player -> bank. Used for purchases, tax, building costs. Does not
 * check sufficiency — callers must check `canAfford` first; this
 * function only ever moves money already validated as payable, keeping
 * bankruptcy detection a caller concern (rules/bankruptcy.ts).
 */
export function payToBank(state: GameState, playerId: string, amount: number): GameState {
  if (amount < 0) throw new Error("payToBank: amount must be >= 0");
  const withPlayer = updatePlayer(state, playerId, (p) => ({ ...p, cash: p.cash - amount }));
  return { ...withPlayer, bank: withPlayer.bank + amount };
}

/**
 * Player -> Free Parking pot. Used for tax under the Free-Parking-jackpot
 * house rule: the money leaves the player but accumulates in the pot rather
 * than the bank, so it stays in circulation until someone lands on Free
 * Parking and collects it via `collectFreeParkingPot`.
 */
export function payToPot(state: GameState, playerId: string, amount: number): GameState {
  if (amount < 0) throw new Error("payToPot: amount must be >= 0");
  const withPlayer = updatePlayer(state, playerId, (p) => ({ ...p, cash: p.cash - amount }));
  return { ...withPlayer, freeParkingPot: withPlayer.freeParkingPot + amount };
}

/** Free Parking pot -> player, emptying the pot. */
export function collectFreeParkingPot(state: GameState, playerId: string): GameState {
  const amount = state.freeParkingPot;
  const withPlayer = updatePlayer(state, playerId, (p) => ({ ...p, cash: p.cash + amount }));
  return { ...withPlayer, freeParkingPot: 0 };
}

/** Player -> player. Used for rent and trades. Never touches the bank total. */
export function payBetweenPlayers(
  state: GameState,
  fromId: string,
  toId: string,
  amount: number,
): GameState {
  if (amount < 0) throw new Error("payBetweenPlayers: amount must be >= 0");
  let next = updatePlayer(state, fromId, (p) => ({ ...p, cash: p.cash - amount }));
  next = updatePlayer(next, toId, (p) => ({ ...p, cash: p.cash + amount }));
  return next;
}

export function canAfford(player: PlayerState, amount: number): boolean {
  return player.cash >= amount;
}

/** Sum of bank + every player's cash + the Free Parking pot. Should be
 *  invariant across every action (the pot just parks money in transit). */
export function totalMoneyInSystem(state: GameState): number {
  return state.bank + state.freeParkingPot + state.players.reduce((sum, p) => sum + p.cash, 0);
}
