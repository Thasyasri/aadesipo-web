import { useState } from "react";
import { useNavigate } from "react-router";
import {
  DEFAULT_HOUSE_RULES,
  STARTING_CASH_PRESETS,
  GAME_MODES,
  CLASSIC_MODE,
  type HouseRules,
  type ModeConfig,
  type PersonalityId,
} from "@aadesipo/engine";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useToast } from "@/components/Toast";
import { formatRupees } from "@/utils/currency";
import {
  useGameView,
  buildAiOpponents,
  buildPassAndPlayPlayers,
  aiDisplayNamesFor,
  AI_PERSONALITY_LABEL,
  AI_DIFFICULTY_SKILL,
  type AiDifficulty,
} from "@/state/gameStore";
import { createRoom, joinRoom } from "@/multiplayer/onlineClient";
import { isSupabaseConfigured } from "@/services/supabase";
import { analyticsEvents } from "@/services/analytics";

const PERSONALITY_ROTATION: readonly PersonalityId[] = ["gambler", "troll", "miser", "gambler"];
// Player-facing character name (from the shared map) plus a play-style
// emoji hint. Names come from AI_DISPLAY_NAMES so setup and in-game match.
const PERSONALITY_EMOJI: Record<PersonalityId, string> = {
  gambler: "🎲",
  troll: "😈",
  miser: "💰",
};

// Player-facing name + one-line pitch for each game mode.
const MODE_META: Record<ModeConfig["id"], { label: string; desc: string }> = {
  classic: { label: "Classic", desc: "Full-length game." },
  quick: { label: "Quick", desc: "Short game — bigger bankroll, fast salary escalation." },
  marathon: { label: "Marathon", desc: "Long haul — gentle pace, plays to elimination." },
};

const DIFFICULTIES: readonly AiDifficulty[] = ["easy", "moderate", "hard", "expert"];
const DEFAULT_DIFFICULTY: AiDifficulty = "moderate";

type Mode = "vs-ai" | "pass-and-play" | "online";

export function NewGameSetup() {
  const [mode, setMode] = useState<Mode>("vs-ai");
  const [aiCount, setAiCount] = useState(2);
  const [playerCount, setPlayerCount] = useState(3);
  const [names, setNames] = useState<string[]>(["Player 1", "Player 2", "Player 3"]);
  const [joinCode, setJoinCode] = useState("");
  const [houseRules, setHouseRules] = useState<HouseRules>(DEFAULT_HOUSE_RULES);
  const [gameMode, setGameMode] = useState<ModeConfig>(CLASSIC_MODE);
  // One difficulty per AI seat, so you can mix (e.g. an Easy + an Expert).
  const [difficulties, setDifficulties] = useState<AiDifficulty[]>([
    DEFAULT_DIFFICULTY,
    DEFAULT_DIFFICULTY,
  ]);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const startGame = useGameView((s) => s.startGame);
  const { showToast } = useToast();

  const opponents = PERSONALITY_ROTATION.slice(0, aiCount);
  const opponentNames = aiDisplayNamesFor(opponents);

  // Changing the AI count resizes the per-seat difficulty list, keeping the
  // seats you already tuned and defaulting any new ones.
  const changeAiCount = (n: number) => {
    setAiCount(n);
    setDifficulties((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) next.push(DEFAULT_DIFFICULTY);
      return next;
    });
  };
  const setDifficultyAt = (i: number, d: AiDifficulty) =>
    setDifficulties((prev) => prev.map((x, idx) => (idx === i ? d : x)));

  const handlePlayerCountChange = (n: number) => {
    setPlayerCount(n);
    setNames((prev) => {
      const next = [...prev];
      while (next.length < n) next.push(`Player ${next.length + 1}`);
      return next.slice(0, n);
    });
  };

  const handleStart = () => {
    const players =
      mode === "vs-ai"
        ? buildAiOpponents(
            "You",
            opponents,
            difficulties.map((d) => AI_DIFFICULTY_SKILL[d]),
          )
        : buildPassAndPlayPlayers(names.map((n) => n.trim() || "Player"));
    const gameId = crypto.randomUUID();
    analyticsEvents.gameStarted(mode, players.length);
    void startGame(gameId, players, mode === "pass-and-play", { houseRules, mode: gameMode }).then(
      () => {
        navigate(`/game/${gameId}`);
      },
    );
  };

  const setRule = <K extends keyof HouseRules>(key: K, value: HouseRules[K]) =>
    setHouseRules((r) => ({ ...r, [key]: value }));

  // Picking a mode also seeds the starting-cash preset with that mode's
  // recommended bankroll (the player can still tweak it in House rules).
  const selectMode = (m: ModeConfig) => {
    setGameMode(m);
    setHouseRules((r) => ({ ...r, startingCash: m.startingCash }));
  };

  // Offline-only game-mode selector, shared by Vs. AI and Pass & Play.
  const modePanel = (
    <div className="mb-6">
      <p className="mb-2 text-caption font-semibold text-text-secondary">Game mode</p>
      <div className="flex flex-col gap-2">
        {GAME_MODES.map((m) => {
          const on = gameMode.id === m.id;
          const meta = MODE_META[m.id];
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              onClick={() => selectMode(m)}
              className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
                on ? "border-brand-primary bg-bg-raised" : "border-bg-raised bg-bg-base"
              }`}
            >
              <span>
                <span className="block text-body text-text-primary">{meta.label}</span>
                <span className="block text-caption text-text-secondary">{meta.desc}</span>
              </span>
              {on && (
                <span className="shrink-0 rounded-pill bg-brand-primary px-2 py-0.5 text-caption font-semibold text-bg-base">
                  On
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  // Offline-only house-rules panel, shared by the Vs. AI and Pass & Play
  // setups. Online games sync a fixed ruleset, so it isn't offered there.
  const houseRulesPanel = (
    <div className="mb-6">
      <p className="mb-2 text-caption font-semibold text-text-secondary">House rules</p>

      <p className="mb-1 text-caption text-text-secondary">Starting cash</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {STARTING_CASH_PRESETS.map((cash) => (
          <Button
            key={cash}
            variant={houseRules.startingCash === cash ? "primary" : "secondary"}
            onClick={() => setRule("startingCash", cash)}
            className="!px-3 !py-2"
          >
            {formatRupees(cash)}
          </Button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {(
          [
            {
              key: "freeParkingJackpot",
              label: "Free Parking jackpot",
              desc: "Taxes pile up under Free Parking — land there to sweep the pot.",
            },
            {
              key: "noAuction",
              label: "No auctions",
              desc: "A declined property stays unowned instead of going up for bid.",
            },
            {
              key: "doubleGoSalary",
              label: "Double salary on GO",
              desc: "Land exactly on GO to collect double.",
            },
            {
              key: "finiteBuildings",
              label: "Limited houses & hotels",
              desc: "The bank stocks 32 houses and 12 hotels — buy them up to starve rivals.",
            },
            {
              key: "evenBuilding",
              label: "Build evenly",
              desc: "Houses must go up (and come down) evenly across a colour group.",
            },
          ] as const
        ).map(({ key, label, desc }) => {
          const on = houseRules[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setRule(key, !on)}
              aria-pressed={on}
              className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
                on ? "border-brand-primary bg-bg-raised" : "border-bg-raised bg-bg-base"
              }`}
            >
              <span>
                <span className="block text-body text-text-primary">{label}</span>
                <span className="block text-caption text-text-secondary">{desc}</span>
              </span>
              <span
                className={`shrink-0 rounded-pill px-2 py-0.5 text-caption font-semibold ${
                  on ? "bg-brand-primary text-bg-base" : "bg-bg-raised text-text-disabled"
                }`}
              >
                {on ? "On" : "Off"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const handleCreateRoom = async () => {
    setBusy(true);
    try {
      const { roomId } = await createRoom(playerCount, gameMode.id, houseRules);
      analyticsEvents.onlineRoomCreated();
      navigate(`/room/${roomId}`);
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!joinCode.trim()) return;
    setBusy(true);
    try {
      const { roomId } = await joinRoom(joinCode.trim());
      analyticsEvents.onlineRoomJoined();
      navigate(`/room/${roomId}`);
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="mb-4 font-display text-heading">New game</h2>

      <div className="mb-4 flex gap-2">
        <Button
          variant={mode === "vs-ai" ? "primary" : "secondary"}
          className="flex-1 !px-2"
          onClick={() => setMode("vs-ai")}
        >
          Vs. AI
        </Button>
        <Button
          variant={mode === "pass-and-play" ? "primary" : "secondary"}
          className="flex-1 !px-2"
          onClick={() => setMode("pass-and-play")}
        >
          Pass &amp; Play
        </Button>
        <Button
          variant={mode === "online" ? "primary" : "secondary"}
          className="flex-1 !px-2"
          onClick={() => setMode("online")}
        >
          Online
        </Button>
      </div>

      {mode === "vs-ai" && (
        <>
          <p className="mb-4 text-body text-text-secondary">
            {MODE_META[gameMode.id].label} mode, vs. AI. {aiCount + 1} players total.
          </p>
          <p className="mb-2 text-caption font-semibold text-text-secondary">AI opponents</p>
          <div className="mb-4 flex gap-2">
            {[1, 2, 3, 4].map((n) => (
              <Button
                key={n}
                variant={aiCount === n ? "primary" : "secondary"}
                onClick={() => changeAiCount(n)}
                className="!px-4 !py-2"
              >
                {n}
              </Button>
            ))}
          </div>
          {/* Per-seat: each rival shows its Telugu play-style and its own
              difficulty (the levels scroll horizontally on narrow screens). */}
          <div className="mb-6 flex flex-col gap-2">
            {opponents.map((id, i) => (
              <div key={i} className="rounded-md border border-bg-raised bg-bg-base p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span aria-hidden="true">{PERSONALITY_EMOJI[id]}</span>
                  <span className="text-body font-semibold text-text-primary">
                    {opponentNames[i]}
                  </span>
                  <span className="text-caption text-text-secondary">
                    · {AI_PERSONALITY_LABEL[id]}
                  </span>
                </div>
                <div
                  className="flex gap-2 overflow-x-auto pb-1"
                  role="group"
                  aria-label={`${opponentNames[i]} difficulty`}
                >
                  {DIFFICULTIES.map((d) => {
                    const on = difficulties[i] === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setDifficultyAt(i, d)}
                        className={`shrink-0 rounded-pill border px-3 py-1 text-caption font-semibold capitalize transition-colors ${
                          on
                            ? "border-brand-primary bg-brand-primary text-bg-base"
                            : "border-bg-raised bg-bg-base text-text-secondary"
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {modePanel}
          {houseRulesPanel}
          <Button variant="primary" className="w-full" onClick={handleStart}>
            Start game
          </Button>
        </>
      )}

      {mode === "pass-and-play" && (
        <>
          <p className="mb-4 text-body text-text-secondary">
            Everyone shares this device — a privacy screen shows between turns.
          </p>
          <p className="mb-2 text-caption font-semibold text-text-secondary">Players</p>
          <div className="mb-4 flex gap-2">
            {[2, 3, 4, 5].map((n) => (
              <Button
                key={n}
                variant={playerCount === n ? "primary" : "secondary"}
                onClick={() => handlePlayerCountChange(n)}
                className="!px-4 !py-2"
              >
                {n}
              </Button>
            ))}
          </div>
          <div className="mb-6 flex flex-col gap-2">
            {names.map((name, i) => (
              <input
                key={i}
                value={name}
                onChange={(e) => {
                  const next = [...names];
                  next[i] = e.target.value;
                  setNames(next);
                }}
                placeholder={`Player ${i + 1}`}
                className="rounded-md border border-bg-raised bg-bg-base px-3 py-2 text-body text-text-primary outline-none focus:border-brand-primary"
                maxLength={20}
              />
            ))}
          </div>
          {modePanel}
          {houseRulesPanel}
          <Button variant="primary" className="w-full" onClick={handleStart}>
            Start game
          </Button>
        </>
      )}

      {mode === "online" && (
        <>
          {!isSupabaseConfigured ? (
            <p className="text-body text-semantic-warn">
              Online play needs Supabase configured — see the README.
            </p>
          ) : (
            <>
              <p className="mb-4 text-body text-text-secondary">
                Play with friends over the internet — real rooms, real invite links.
              </p>
              <p className="mb-2 text-caption font-semibold text-text-secondary">Room size</p>
              <div className="mb-4 flex gap-2">
                {[2, 3, 4, 5].map((n) => (
                  <Button
                    key={n}
                    variant={playerCount === n ? "primary" : "secondary"}
                    onClick={() => setPlayerCount(n)}
                    className="!px-4 !py-2"
                  >
                    {n}
                  </Button>
                ))}
              </div>
              {/* The host picks the mode + house rules; everyone in the room
                  plays under them (stored on the room, enforced server-side). */}
              {modePanel}
              {houseRulesPanel}
              <Button
                variant="primary"
                className="mb-6 w-full"
                disabled={busy}
                onClick={() => void handleCreateRoom()}
              >
                Create a room
              </Button>

              <div className="mb-3 flex items-center gap-3">
                <div className="h-px flex-1 bg-bg-raised" />
                <span className="text-caption text-text-disabled">or</span>
                <div className="h-px flex-1 bg-bg-raised" />
              </div>

              <div className="flex gap-2">
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Room code"
                  maxLength={6}
                  className="flex-1 rounded-md border border-bg-raised bg-bg-base px-3 py-2 text-body uppercase tracking-widest text-text-primary outline-none focus:border-brand-primary"
                />
                <Button variant="secondary" disabled={busy} onClick={() => void handleJoinRoom()}>
                  Join
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </Card>
  );
}
