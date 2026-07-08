import { create } from "zustand";
import {
  applyAction,
  createInitialState,
  getActingPlayerId,
  CLASSIC_MODE,
  DEFAULT_HOUSE_RULES,
  createRngState,
  PERSONALITIES,
  type Action,
  type GameEvent,
  type GameState,
  type HouseRules,
  type ModeConfig,
  type RngState,
  type AiConfig,
  type PersonalityId,
} from "@aadesipo/engine";
import {
  enqueuePersistAction,
  persistNewGame,
  loadGame,
  deleteActionsFrom,
  flushPersistence,
} from "@/services/db";
import { getAiDefaultSkillLevel } from "@/services/analytics";

export interface PlayerSetup {
  readonly id: string;
  readonly displayName: string;
  /** undefined = human-controlled (locally, at this device). */
  readonly ai?: AiConfig;
}

/** Optional configuration for a new game. All default to a classic setup. */
export interface StartGameOptions {
  readonly houseRules?: HouseRules;
  readonly mode?: ModeConfig;
  /** Fixed RNG seed — used by tests for determinism; random otherwise. */
  readonly seed?: string;
}

interface GameViewState {
  gameId: string | null;
  game: GameState | null;
  players: readonly PlayerSetup[];
  isPassAndPlay: boolean;
  aiRng: RngState;
  actionSeq: number;
  /** The latest action's events — drives dice ceremony + cash-delta pops. */
  recentEvents: readonly GameEvent[];
  /** The full, accumulating activity log since the game started. Rebuilt
   *  from persisted actions on resume, so it survives refresh. */
  eventLog: readonly GameEvent[];
  /** The most recently applied action — powers the pass-and-play undo (and its
   *  eligibility check). Null before any action / after undoing back to start. */
  lastAction: Action | null;
  lastError: string | null;

  startGame: (
    gameId: string,
    players: readonly PlayerSetup[],
    isPassAndPlay: boolean,
    options?: StartGameOptions,
  ) => Promise<void>;
  resumeGame: (gameId: string) => Promise<boolean>;
  dispatch: (action: Action) => void;
  /** Reverts the last action (pass-and-play only). A no-op if there's nothing
   *  to undo or the last action was a dice roll (which would let you re-roll). */
  undo: () => Promise<void>;
  isActingPlayerAi: () => boolean;
  actingAiConfig: () => AiConfig | null;
  setAiRng: (rng: RngState) => void;
}

export const useGameView = create<GameViewState>((set, get) => ({
  gameId: null,
  game: null,
  players: [],
  isPassAndPlay: false,
  aiRng: createRngState("ai-default"),
  actionSeq: 0,
  recentEvents: [],
  eventLog: [],
  lastAction: null,
  lastError: null,

  startGame: async (gameId, players, isPassAndPlay, options) => {
    const gameSeed = options?.seed ?? crypto.randomUUID();
    const rules = options?.houseRules ?? DEFAULT_HOUSE_RULES;
    const mode = options?.mode ?? CLASSIC_MODE;
    const game = createInitialState(
      gameSeed,
      mode,
      players.map((p) => p.id),
      rules,
    );
    await persistNewGame(gameId, gameSeed, players, isPassAndPlay, rules, mode);
    set({
      gameId,
      game,
      players,
      isPassAndPlay,
      aiRng: createRngState(`ai-${gameSeed}`),
      actionSeq: 0,
      recentEvents: [],
      eventLog: [],
      lastAction: null,
      lastError: null,
    });
  },

  resumeGame: async (gameId) => {
    const loaded = await loadGame(gameId);
    if (!loaded) return false;

    const rules = loaded.meta.houseRules ?? DEFAULT_HOUSE_RULES;
    const mode = loaded.meta.mode ?? CLASSIC_MODE;
    let state =
      loaded.snapshot?.state ??
      createInitialState(
        loaded.meta.seed,
        mode,
        loaded.meta.players.map((p) => p.id),
        rules,
      );
    let seq = loaded.snapshot?.seq ?? 0;

    for (const action of loaded.actionsToReplay) {
      const result = applyAction(state, action);
      if (!result.ok) {
        set({ lastError: `Resume failed at action ${seq + 1}: ${result.reason}` });
        return false;
      }
      state = result.state;
      seq += 1;
    }

    // Rebuild the full activity log by replaying every action from the start
    // (the snapshot fast-path above only reconstructs state, not history).
    const logState0 = createInitialState(
      loaded.meta.seed,
      mode,
      loaded.meta.players.map((p) => p.id),
      rules,
    );
    let logState = logState0;
    const eventLog: GameEvent[] = [];
    for (const action of loaded.allActions) {
      const result = applyAction(logState, action);
      if (!result.ok) break;
      logState = result.state;
      eventLog.push(...result.events);
    }

    set({
      gameId,
      game: state,
      players: loaded.meta.players,
      isPassAndPlay: loaded.meta.isPassAndPlay,
      aiRng: createRngState(`ai-${loaded.meta.seed}`),
      actionSeq: seq,
      recentEvents: [],
      eventLog,
      lastAction: loaded.allActions[seq - 1] ?? null,
      lastError: null,
    });
    return true;
  },

  dispatch: (action) => {
    const { game, gameId, actionSeq, eventLog } = get();
    if (!game || !gameId) return;

    const result = applyAction(game, action);
    if (!result.ok) {
      set({ lastError: result.reason });
      return;
    }

    const nextSeq = actionSeq + 1;
    // Fire-and-forget for the UI, but routed through the serialized queue
    // so this save is provably ordered behind every earlier one and can't
    // be dropped by an overlapping in-flight write — the failure mode that
    // showed up as lost saves under fast AI turns. See enqueuePersistAction.
    void enqueuePersistAction(gameId, nextSeq, action, result.state);

    set({
      game: result.state,
      recentEvents: result.events,
      eventLog: [...eventLog, ...result.events],
      lastAction: action,
      lastError: null,
      actionSeq: nextSeq,
    });
  },

  undo: async () => {
    const { game, gameId, actionSeq, isPassAndPlay, lastAction } = get();
    if (!game || !gameId || !isPassAndPlay) return;
    if (actionSeq <= 0 || !lastAction) return;
    if (lastAction.type === "RollDice") return; // can't un-roll (would re-fish the dice)

    // Drain any queued save of the action we're about to drop, so it can't
    // re-land on disk after we delete it.
    await flushPersistence();
    const loaded = await loadGame(gameId);
    if (!loaded) return;

    const rules = loaded.meta.houseRules ?? DEFAULT_HOUSE_RULES;
    const mode = loaded.meta.mode ?? CLASSIC_MODE;
    const keep = loaded.allActions.slice(0, actionSeq - 1);

    // Rebuild state and the activity log from the remaining actions.
    let state = createInitialState(
      loaded.meta.seed,
      mode,
      loaded.meta.players.map((p) => p.id),
      rules,
    );
    const eventLog: GameEvent[] = [];
    for (const action of keep) {
      const result = applyAction(state, action);
      if (!result.ok) {
        set({ lastError: `Undo failed: ${result.reason}` });
        return;
      }
      state = result.state;
      eventLog.push(...result.events);
    }

    await deleteActionsFrom(gameId, actionSeq);

    set({
      game: state,
      actionSeq: actionSeq - 1,
      lastAction: keep[keep.length - 1] ?? null,
      recentEvents: [], // snap back — don't replay ceremonies/animations for an undo
      eventLog,
      lastError: null,
    });
  },

  isActingPlayerAi: () => {
    const { game, players } = get();
    if (!game) return false;
    const actingId = getActingPlayerId(game);
    return players.find((p) => p.id === actingId)?.ai !== undefined;
  },

  actingAiConfig: () => {
    const { game, players } = get();
    if (!game) return null;
    const actingId = getActingPlayerId(game);
    return players.find((p) => p.id === actingId)?.ai ?? null;
  },

  setAiRng: (rng) => set({ aiRng: rng }),
}));

/**
 * Player-facing names for the AI personalities. The personality *ids*
 * (miser/gambler/troll) and all decision logic stay as-is in the engine;
 * this map only controls the human-readable name shown in the UI, so the
 * opponents read as characters ("Ria") rather than mechanics ("Miser Bot").
 */
export const AI_DISPLAY_NAMES: Readonly<Record<PersonalityId, string>> = {
  miser: "Ria",
  gambler: "Ayush",
  troll: "Dev",
};

/**
 * Telugu-audience play-style labels for the AI personalities — shown in setup
 * so each rival reads as a recognisable character rather than a mechanic. The
 * engine ids (gambler/troll/miser) are unchanged; these match the Landing.
 */
export const AI_PERSONALITY_LABEL: Readonly<Record<PersonalityId, string>> = {
  gambler: "Rowdy",
  troll: "Konte",
  miser: "Pisinari",
};

/**
 * A pool of distinct names so that when a personality repeats (e.g. four AIs
 * means two gamblers), every opponent still gets a UNIQUE name — no more two
 * "Ayush"es at the table. Starts with the per-personality preferred names.
 */
const AI_NAME_POOL: readonly string[] = [
  "Ayush",
  "Dev",
  "Ria",
  "Kiran",
  "Meera",
  "Sai",
  "Priya",
  "Arjun",
];

/**
 * AI difficulty maps to the engine's `skillLevel` (0-1) — how often the AI
 * takes its valuation's best answer vs. a plausible-but-worse one. Same rules
 * at every level (no cheating), just more or less decision noise.
 */
export type AiDifficulty = "easy" | "moderate" | "hard" | "expert";

// Spread four distinct tiers across the model's 0-1 adherence scale. "expert"
// is the true ceiling (1.0 = always plays its valuation's best answer), so
// "hard" is a notch below it rather than the old flat maximum.
export const AI_DIFFICULTY_SKILL: Readonly<Record<AiDifficulty, number>> = {
  easy: 0.4,
  moderate: 0.65,
  hard: 0.85,
  expert: 1.0,
};

/**
 * Resolve each personality to a UNIQUE player-facing name. A personality's
 * preferred name is used for its first occurrence; a repeat (e.g. two gamblers
 * at a 4-AI table) falls back to the next unused pool name — no duplicate
 * "Ayush"es. Shared by the setup preview and the actual game build.
 */
export function aiDisplayNamesFor(aiPersonalityIds: readonly PersonalityId[]): string[] {
  const used = new Set<string>();
  return aiPersonalityIds.map((id, i) => {
    let name = AI_DISPLAY_NAMES[id];
    if (used.has(name)) {
      name = AI_NAME_POOL.find((n) => !used.has(n)) ?? `Rival ${i + 1}`;
    }
    used.add(name);
    return name;
  });
}

export function buildAiOpponents(
  humanName: string,
  aiPersonalityIds: readonly (keyof typeof PERSONALITIES)[],
  // A single level applied to every AI, or one level per opponent (by index).
  skill: number | readonly number[] = getAiDefaultSkillLevel(),
): PlayerSetup[] {
  const human: PlayerSetup = { id: "human", displayName: humanName };
  const names = aiDisplayNamesFor(aiPersonalityIds);
  const ais: PlayerSetup[] = aiPersonalityIds.map((id, i) => {
    const skillLevel = typeof skill === "number" ? skill : (skill[i] ?? getAiDefaultSkillLevel());
    return {
      id: `ai-${i}-${id}`,
      displayName: names[i]!,
      ai: { personality: PERSONALITIES[id], skillLevel },
    };
  });
  return [human, ...ais];
}

export function buildPassAndPlayPlayers(names: readonly string[]): PlayerSetup[] {
  return names.map((name, i) => ({ id: `local-${i}`, displayName: name }));
}
