import { useEffect, useRef, useState } from "react";
import { Application, Circle, Container, Graphics, Rectangle, Text, TextStyle } from "pixi.js";
import {
  BOARD,
  getActingPlayerId,
  isOwnable,
  JAIL_POSITION,
  type GameEvent,
  type GameState,
  type PropertyOwnership,
  type Tile,
} from "@aadesipo/engine";
import { computeTileRect, type TileRect } from "./tileLayout";
import { GROUP_COLORS } from "@/theme/groupColors";
import { PLAYER_COLORS, SEMANTIC_COLORS, hexToPixiColor } from "@/theme/tokens";
import type { PlayerSetup } from "@/state/gameStore";
import { formatRupeesCompact } from "@/utils/currency";

interface BoardProps {
  game: GameState;
  /** Player setups, so tokens and owner badges show the display-name initial. */
  players?: readonly PlayerSetup[];
  /** The latest action's events — drives step-by-step token movement (each
   *  PlayerMoved is walked tile-by-tile rather than jumped). */
  events?: readonly GameEvent[];
  /** Tapped any tile — opens its detail sheet (full name + details). */
  onSelectTile?: (position: number) => void;
  /** Tapped the center emblem — opens the event-tables sheet. */
  onSelectEmblem?: () => void;
}

// Per-player token seat within a tile, so multiple tokens on one tile don't
// stack exactly. Indexed by player order.
const SEAT_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-8, -8],
  [8, -8],
  [-8, 8],
  [8, 8],
  [0, 0],
];

// Longest move animated tile-by-tile. Dice rolls (2-12) and short event hops
// always walk; a long "advance to tile" jump just glides straight there.
export const WALK_STEP_CAP = 12;

// A dice-driven move holds the token in place this long before walking, so it
// steps out only once the roll has been revealed (matches DiceCeremony's
// TUMBLE_MS ~700ms) rather than moving while the dice are still tumbling.
export const WALK_START_DELAY_MS = 720;

// Duration of one tile-to-tile hop. Also the game screen's per-tile estimate
// for holding the landing sheet until the walk is done, so the coin isn't hidden.
const HOP_MS = 200;
export const APPROX_MS_PER_TILE = HOP_MS;

const BG_BASE = hexToPixiColor("#0F1222");
const BG_SURFACE = hexToPixiColor("#1A1F35");
const TEXT_PRIMARY = hexToPixiColor("#F4F5FA");
const TEXT_MUTED = hexToPixiColor("#9AA3C4");
const HOUSE_COLOR = hexToPixiColor(SEMANTIC_COLORS.success); // green — houses
const HOTEL_COLOR = hexToPixiColor(SEMANTIC_COLORS.error); // red — hotel
const ICON_STROKE = hexToPixiColor("#0B0E1A"); // near-black outline so icons read on any band
const MORTGAGED_ALPHA = 0.45;
// Owner badge: a neutral white chip with a dark initial — readable on any
// group-band color and independent of the player's assigned color.
const BADGE_FILL = TEXT_PRIMARY;
const BADGE_STROKE = BG_BASE;
const BADGE_TEXT = hexToPixiColor("#141A33");

// Center emblem palette (marigold + coral, per the app brand).
const EMBLEM_MARIGOLD = hexToPixiColor("#FFB020");
const EMBLEM_CORAL = hexToPixiColor("#FF5D5D");
const EMBLEM_INK = hexToPixiColor("#141A33");
const DIE_FACE_5 = [
  [-0.26, -0.26],
  [0.26, -0.26],
  [0, 0],
  [-0.26, 0.26],
  [0.26, 0.26],
] as const;
const DIE_FACE_2 = [
  [-0.24, -0.24],
  [0.24, 0.24],
] as const;

const MIN_BOARD_SIZE = 240;

/**
 * Short 2–4 letter codes used ONLY for the on-board tile text, so labels stay
 * large and crisp at any board size. The real tile name (and every other
 * detail) is shown when the tile is tapped — see TileDetailSheet. The full
 * name is still used everywhere else (trades, log, victory).
 */
const BOARD_LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  // Properties
  Nizamabad: "NZB",
  Karimnagar: "KRM",
  Khammam: "KMM",
  Nalgonda: "NLG",
  Warangal: "WL",
  Kadapa: "KDP",
  Rajahmundry: "RJM",
  Kakinada: "KKN",
  Nellore: "NLR",
  Guntur: "GNT",
  Visakhapatnam: "VZG",
  Vijayawada: "VJW",
  Tirupati: "TRP",
  Amaravati: "AMR",
  Gachibowli: "GCB",
  "Banjara Hills": "BJH",
  "Jubilee Hills": "JBH",
  Charminar: "CHM",
  "Golconda Fort": "GCF",
  "Hussain Sagar": "HSG",
  "Gateway of India": "GOI",
  "Taj Mahal": "TJM",
  // Transit
  "Secunderabad Junction": "SEC",
  "Kacheguda Station": "KCG",
  "Begumpet Station": "BGP",
  "Falaknuma Station": "FLK",
  // Utilities
  "Telangana Power Grid": "TPG",
  "Godavari Water Board": "GWB",
  // Tax
  "Income Tax": "IT",
  "Luxury Tax": "LT",
  // Corners & event tiles
  GO: "GO",
  "Jail / Just Visiting": "JAIL",
  "Go To Jail": "GTJ",
  "Free Parking": "FP",
  Chance: "?",
  "Sarpanch Gari Dabba": "SGD",
};

function boardTileLabel(name: string): string {
  return BOARD_LABEL_OVERRIDES[name] ?? name;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The color band always sits on the tile edge facing the board's center,
 * so it reads consistently on all four sides: top edge for bottom-row
 * tiles, bottom edge for top-row, right edge for the left column, left
 * edge for the right column. Derived from the tile's label rotation, which
 * already encodes which side of the board it's on.
 */
function bandRect(rect: TileRect, thickness: number): Box {
  const r = rect.rotation;
  if (Math.abs(r) < 0.01) {
    return { x: rect.x, y: rect.y, w: rect.width, h: thickness }; // bottom row → top edge
  }
  if (Math.abs(Math.abs(r) - Math.PI) < 0.01) {
    return { x: rect.x, y: rect.y + rect.height - thickness, w: rect.width, h: thickness }; // top row → bottom
  }
  if (r > 0) {
    return { x: rect.x + rect.width - thickness, y: rect.y, w: thickness, h: rect.height }; // left col → right
  }
  return { x: rect.x, y: rect.y, w: thickness, h: rect.height }; // right col → left edge
}

/** Center of the (inward-facing) color band — where the owner badge sits,
 *  one consistent spot on every tile regardless of which side it's on. */
function bandCenter(rect: TileRect, cell: number): { x: number; y: number } {
  const band = bandRect(rect, cell * 0.25);
  return { x: band.x + band.w / 2, y: band.y + band.h / 2 };
}

/**
 * Largest square that fits the board's column: the container's width, but
 * never wider than the actual visible viewport (so the board can't be pushed
 * off-screen if anything on the page causes horizontal overflow), and capped
 * by the space left below it so a tall desktop column doesn't run past the
 * bottom of the viewport. The board simply gets denser at small widths — all
 * 40 tiles always stay fully on screen.
 */
function measureBoardSize(wrapper: HTMLElement): number {
  const width = wrapper.clientWidth;
  // clientWidth excludes any vertical scrollbar; visualViewport reflects the
  // truly visible width (pinch-zoom aware) and is the hard ceiling on mobile.
  const viewportWidth =
    window.visualViewport?.width ?? document.documentElement.clientWidth ?? width;
  const top = wrapper.getBoundingClientRect().top;
  const availableHeight = window.innerHeight - top - 16;
  return Math.max(MIN_BOARD_SIZE, Math.min(width, viewportWidth, availableHeight));
}

// Tile label + price fonts scale with the board `cell` (size/11) instead of a
// fixed pixel size, so text stays legible from a tiny phone board (~32px cells)
// up to a large desktop one (~64px). The wrap width is tied to the tile width
// too — the old fixed 52px was wider than a phone tile and bled label text into
// the neighbouring tiles (the overlap the board was suffering from).
function makeTileLabelStyle(cell: number): TextStyle {
  const fontSize = Math.round(Math.max(9, Math.min(cell * 0.3, 16)));
  return new TextStyle({
    fill: TEXT_PRIMARY,
    fontSize,
    fontFamily: "Inter, system-ui, sans-serif",
    fontWeight: "600",
    wordWrap: true,
    // Break long single words too (Kacheguda, Rajmundry…) so a name wraps
    // within its tile instead of overflowing along a rotated side tile into
    // its neighbours.
    breakWords: true,
    wordWrapWidth: cell * 0.94,
    lineHeight: Math.round(fontSize * 1.05),
    align: "center",
  });
}

function makePriceLabelStyle(cell: number): TextStyle {
  return new TextStyle({
    fill: TEXT_MUTED,
    fontSize: Math.round(Math.max(7, Math.min(cell * 0.2, 11))),
    fontFamily: "Inter, system-ui, sans-serif",
    fontWeight: "700",
    align: "center",
  });
}

interface TokenSprite {
  container: Container;
  /** The token's resting spot (its tile seat) — where it eases to when not
   *  mid-walk. */
  targetX: number;
  targetY: number;
  /** Pending tile seats for a step-by-step walk (each an intermediate tile,
   *  ending at the destination). Empty when settled. */
  queue: Array<[number, number]>;
  /** The hop currently in flight — a single tile-to-tile bounce (Ludo-style),
   *  or null when the token isn't hopping. */
  hop: { fromX: number; fromY: number; toX: number; toY: number; elapsed: number } | null;
}

/** Live overlay objects for one ownable tile, updated in place. */
interface TileOverlay {
  priceText: Text;
  ownerBadge: Graphics; // neutral chip on the band…
  ownerInitial: Text; // …with the owner's initial letter
  buildings: Graphics;
}

/**
 * The unit vector pointing from the board's centre straight out through a
 * tile's outer edge, derived from the tile's rotation (which encodes its
 * side). Purely perpendicular to the edge — unlike the board-centre direction
 * it doesn't skew diagonally near the corners, so labels stay square.
 */
function outwardNormal(rotation: number): readonly [number, number] {
  if (Math.abs(rotation) < 0.01) return [0, 1]; // bottom row → down
  if (Math.abs(Math.abs(rotation) - Math.PI) < 0.01) return [0, -1]; // top row → up
  if (rotation > 0) return [-1, 0]; // left column → left
  return [1, 0]; // right column → right
}

/**
 * Where a tile's code and price sit. The colour band hugs the tile's INNER
 * edge (facing the board centre), so both labels are placed on the OUTER side
 * of it, along the tile's outward normal: the code centred in the tile body,
 * the price further out toward the rim. This keeps text off the colour slip
 * and stops the code and price from overlapping each other.
 */
function tileTextLayout(rect: TileRect, cell: number) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const [nx, ny] = outwardNormal(rect.rotation);
  return {
    nameX: cx + nx * cell * 0.05,
    nameY: cy + ny * cell * 0.05,
    priceX: cx + nx * cell * 0.34,
    priceY: cy + ny * cell * 0.34,
    rotation: rect.rotation,
  };
}

export function Board({ game, players, events = [], onSelectTile, onSelectEmblem }: BoardProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  // Kept in refs so the (once-per-size) init effect always calls the latest
  // handlers without needing to re-init Pixi when they change.
  const onSelectTileRef = useRef(onSelectTile);
  onSelectTileRef.current = onSelectTile;
  const onSelectEmblemRef = useRef(onSelectEmblem);
  onSelectEmblemRef.current = onSelectEmblem;
  // Player id -> single-letter initial (from display name), used by both the
  // tokens and the owner badges so they read consistently (Y/A/D, not H/A/A).
  const initialForRef = useRef<(id: string) => string>(() => "?");
  initialForRef.current = (id) =>
    (players?.find((p) => p.id === id)?.displayName ?? id).slice(0, 1).toUpperCase();
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const tokensRef = useRef<Map<string, TokenSprite>>(new Map());
  /** Per-tile container holding that tile's base graphics + overlays, so a
   *  single alpha set greys out the whole tile when mortgaged. */
  const tileContainersRef = useRef<Map<number, Container>>(new Map());
  const overlaysRef = useRef<Map<number, TileOverlay>>(new Map());
  // Pixi init is async; this flips once the world exists so the state-driven
  // effects below know they can safely draw (and re-run to do their first draw).
  const [ready, setReady] = useState(false);
  // The board renders as a square sized to its container — full viewport
  // width on phones, ~2/3 of the row on desktop. 0 until first measured.
  const [size, setSize] = useState(0);

  // Measure the container and keep `size` in sync with it (debounced so a
  // drag-resize doesn't thrash the Pixi renderer). A size change re-runs the
  // init effect below, which redraws the whole board at the new scale.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    let timer: number | undefined;
    const update = () => {
      const next = Math.round(measureBoardSize(wrapper));
      setSize((prev) => (Math.abs(prev - next) >= 1 ? next : prev));
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(update, 120);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(wrapper);
    window.addEventListener("resize", schedule);
    update();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || size <= 0) return;

    const app = new Application();
    const tokens = tokensRef.current;
    const tileContainers = tileContainersRef.current;
    const overlays = overlaysRef.current;
    let destroyed = false;

    void app
      .init({
        width: size,
        height: size,
        backgroundColor: BG_BASE,
        antialias: true,
        // Render at the device's pixel ratio (capped at 3) so tile text and
        // icons stay crisp on high-DPI phones/retina laptops rather than being
        // upscaled from a 2x raster — the old cap of 2 read as slightly blurry.
        resolution: Math.min(window.devicePixelRatio || 1, 3),
        autoDensity: true,
      })
      .then(() => {
        if (destroyed) {
          app.destroy(true, { children: true });
          return;
        }
        host.appendChild(app.canvas);
        appRef.current = app;

        const world = new Container();
        app.stage.addChild(world);
        worldRef.current = world;
        drawStaticBoard(
          world,
          size,
          tileContainers,
          (position) => onSelectTileRef.current?.(position),
          () => onSelectEmblemRef.current?.(),
        );

        const cell = size / 11;
        const hopHeight = cell * 0.5; // how high the token arcs between tiles
        app.ticker.add((ticker) => {
          const dt = ticker.deltaMS;
          for (const token of tokens.values()) {
            if (token.hop) {
              // A single tile-to-tile bounce: ease across horizontally while
              // arcing up and back down, with a little pop at the apex — the
              // Ludo-style hop.
              token.hop.elapsed += dt;
              const p = Math.min(1, token.hop.elapsed / HOP_MS);
              const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOut
              const arc = Math.sin(Math.PI * p);
              token.container.x = token.hop.fromX + (token.hop.toX - token.hop.fromX) * e;
              token.container.y =
                token.hop.fromY + (token.hop.toY - token.hop.fromY) * e - hopHeight * arc;
              token.container.scale.set(1 + 0.12 * arc);
              if (p >= 1) {
                token.container.x = token.hop.toX;
                token.container.y = token.hop.toY;
                token.container.scale.set(1);
                token.hop = null;
              }
            } else if (token.queue.length > 0) {
              // Start the next hop toward the upcoming tile seat.
              const [tx, ty] = token.queue.shift()!;
              token.hop = {
                fromX: token.container.x,
                fromY: token.container.y,
                toX: tx,
                toY: ty,
                elapsed: 0,
              };
            } else {
              // Settled: ease gently to the resting seat.
              token.container.x += (token.targetX - token.container.x) * 0.2;
              token.container.y += (token.targetY - token.container.y) * 0.2;
            }
          }
        });

        setReady(true);
      });

    return () => {
      destroyed = true;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
      tokens.clear();
      tileContainers.clear();
      overlays.clear();
      worldRef.current = null;
      setReady(false);
      host.replaceChildren();
    };
  }, [size]);

  // Tokens: keep each token's resting seat and bankruptcy dimming in sync with
  // state. Movement itself (the step-by-step walk) is driven by the events
  // effect below; here we only set the final resting target, so a token that
  // isn't walking eases to the right spot (new game, resume, non-move updates).
  useEffect(() => {
    const world = worldRef.current;
    if (!ready || !world) return;

    const cell = size / 11;

    game.players.forEach((player, i) => {
      const rect = computeTileRect(player.position, size);
      const [ox, oy] = SEAT_OFFSETS[i % SEAT_OFFSETS.length]!;
      const targetX = rect.x + rect.width / 2 + ox;
      const targetY = rect.y + rect.height / 2 + oy;

      let token = tokensRef.current.get(player.id);
      if (!token) {
        const container = new Container();
        const circle = new Graphics()
          .circle(0, 0, Math.min(cell, 24) * 0.28)
          .fill(hexToPixiColor(PLAYER_COLORS[i % PLAYER_COLORS.length]!))
          .stroke({ width: 2, color: BG_BASE });
        const label = new Text({
          text: initialForRef.current(player.id),
          style: new TextStyle({ fill: BG_BASE, fontSize: 11, fontWeight: "700" }),
        });
        label.anchor.set(0.5);
        container.addChild(circle, label);
        container.x = targetX;
        container.y = targetY;
        world.addChild(container);
        token = { container, targetX, targetY, queue: [], hop: null };
        tokensRef.current.set(player.id, token);
      }
      token.targetX = targetX;
      token.targetY = targetY;
      token.container.alpha = player.isBankrupt ? 0.3 : 1;
    });
  }, [game, size, ready]);

  // Step-by-step movement: turn each PlayerMoved (and jail hop) in the latest
  // action's events into a queue of tile-seat waypoints, so the token walks the
  // track one tile at a time instead of jumping to the destination.
  const lastWalkedRef = useRef<readonly GameEvent[] | null>(null);
  useEffect(() => {
    if (!ready || !worldRef.current || events.length === 0) return;
    // A given events batch (one dispatch) is walked once; identity changes per
    // dispatch, so this also naturally ignores unrelated re-renders.
    if (lastWalkedRef.current === events) return;
    lastWalkedRef.current = events;

    const indexOf = new Map(game.players.map((p, i) => [p.id, i]));
    const paths = new Map<string, number[]>();
    const push = (id: string, pos: number) => {
      const seq = paths.get(id) ?? [];
      seq.push(pos);
      paths.set(id, seq);
    };

    for (const ev of events) {
      if (ev.type === "PlayerMoved") {
        const dir = Math.sign(ev.steps);
        const count = Math.abs(ev.steps);
        if (count > 0 && count <= WALK_STEP_CAP) {
          for (let k = 1; k <= count; k++)
            push(ev.playerId, (((ev.from + dir * k) % 40) + 40) % 40);
        } else {
          push(ev.playerId, ev.to); // no move, or a long jump — glide straight there
        }
      } else if (ev.type === "SentToJail") {
        push(ev.playerId, JAIL_POSITION); // hop to jail after any walk resolves
      }
    }
    if (paths.size === 0) return;

    const waypoint = (playerId: string, pos: number): [number, number] => {
      const [ox, oy] = SEAT_OFFSETS[(indexOf.get(playerId) ?? 0) % SEAT_OFFSETS.length]!;
      const rect = computeTileRect(pos, size);
      return [rect.x + rect.width / 2 + ox, rect.y + rect.height / 2 + oy];
    };
    const startWalk = () => {
      for (const [playerId, tilePositions] of paths) {
        const token = tokensRef.current.get(playerId);
        if (!token) continue;
        token.queue = tilePositions.map((pos) => waypoint(playerId, pos));
        const last = token.queue[token.queue.length - 1];
        if (last) [token.targetX, token.targetY] = last; // rest at the destination
      }
    };

    // A dice roll reveals the number first (the dice ceremony), so hold the
    // mover(s) in place, then step out once the dice have settled — instead of
    // gliding to the destination behind the overlay. Non-roll moves walk at once.
    if (!events.some((e) => e.type === "DiceRolled")) {
      startWalk();
      return;
    }
    for (const playerId of paths.keys()) {
      const token = tokensRef.current.get(playerId);
      if (!token) continue;
      token.queue = [];
      token.hop = null;
      token.targetX = token.container.x; // freeze where it is during the reveal
      token.targetY = token.container.y;
    }
    const timer = window.setTimeout(startWalk, WALK_START_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [events, game, size, ready]);

  // Per-tile property-state overlays: price (unowned), owner marker, building
  // level, and mortgage dimming — refreshed on every game.properties change.
  useEffect(() => {
    if (!ready || !worldRef.current) return;

    const cell = size / 11;

    for (const tile of BOARD) {
      if (!isOwnable(tile)) continue;
      const container = tileContainersRef.current.get(tile.position);
      if (!container) continue;

      let overlay = overlaysRef.current.get(tile.position);
      if (!overlay) {
        overlay = createTileOverlay(container, tile, computeTileRect(tile.position, size), cell);
        overlaysRef.current.set(tile.position, overlay);
      }

      const ownership = game.properties[tile.position];
      const owned = !!ownership?.ownerId;

      // Price — only while unowned.
      overlay.priceText.visible = !owned;

      // Owner marker — a neutral chip on the band showing the owner's initial,
      // so ownership reads by letter, never by a color that might clash with
      // the tile's group band. The letter matches the player's board token.
      if (owned) {
        const c = bandCenter(computeTileRect(tile.position, size), cell);
        const r = cell * 0.16;
        overlay.ownerBadge
          .clear()
          .circle(c.x, c.y, r)
          .fill(BADGE_FILL)
          .stroke({ width: 1.5, color: BADGE_STROKE });
        overlay.ownerBadge.visible = true;
        overlay.ownerInitial.text = initialForRef.current(ownership!.ownerId!);
        overlay.ownerInitial.x = c.x;
        overlay.ownerInitial.y = c.y;
        overlay.ownerInitial.visible = true;
      } else {
        overlay.ownerBadge.visible = false;
        overlay.ownerInitial.visible = false;
      }

      // Building level — houses or a hotel.
      drawBuildings(overlay.buildings, tile, ownership, computeTileRect(tile.position, size), cell);

      // Mortgage — grey the whole tile out.
      container.alpha = ownership?.isMortgaged ? MORTGAGED_ALPHA : 1;
    }
  }, [game, size, ready]);

  const actingId = game.turnPhase === "game-over" ? null : getActingPlayerId(game);
  const boardLabel =
    game.turnPhase === "game-over"
      ? "Game board, game over"
      : `Game board. Player positions and turn details are also listed above and below this board.${
          actingId ? ` It is currently ${actingId}'s turn.` : ""
        }`;

  return (
    <div ref={wrapperRef} className="w-full">
      <div
        className="relative mx-auto"
        style={{ width: size || "100%", height: size || undefined }}
      >
        <div
          ref={hostRef}
          role="img"
          aria-label={boardLabel}
          className="overflow-hidden rounded-lg"
          style={{ width: size, height: size }}
        />
      </div>
    </div>
  );
}

function drawStaticBoard(
  stage: Container,
  size: number,
  tileContainers: Map<number, Container>,
  onTileTap: (position: number) => void,
  onEmblemTap: () => void,
) {
  const cell = size / 11;
  for (const tile of BOARD) {
    const rect = computeTileRect(tile.position, size);
    const container = new Container();

    const g = new Graphics()
      .rect(rect.x, rect.y, rect.width, rect.height)
      .fill(BG_SURFACE)
      .stroke({ width: 1, color: hexToPixiColor("#242B47") });
    container.addChild(g);

    if (tile.type === "property") {
      const b = bandRect(rect, Math.min(rect.height, rect.width) * 0.25);
      const band = new Graphics()
        .rect(b.x, b.y, b.w, b.h)
        .fill(hexToPixiColor(GROUP_COLORS[tile.group]));
      container.addChild(band);
    }

    // Ownable tiles also carry a price line, so nudge their name toward the
    // outer rim to make room; other tiles stay centered as before.
    const label = new Text({ text: boardTileLabel(tile.name), style: makeTileLabelStyle(cell) });
    label.anchor.set(0.5);
    if (isOwnable(tile)) {
      const layout = tileTextLayout(rect, cell);
      label.x = layout.nameX;
      label.y = layout.nameY;
    } else {
      label.x = rect.x + rect.width / 2;
      label.y = rect.y + rect.height / 2;
    }
    label.rotation = rect.rotation;
    container.addChild(label);

    // Every tile is tap-to-inspect (short board codes mean the full name and
    // details live in the detail sheet); the whole tile is the hit target.
    container.eventMode = "static";
    container.cursor = "pointer";
    container.hitArea = new Rectangle(rect.x, rect.y, rect.width, rect.height);
    container.on("pointertap", () => onTileTap(tile.position));

    stage.addChild(container);
    tileContainers.set(tile.position, container);
  }

  drawCenterEmblem(stage, size, onEmblemTap);
}

/**
 * The board's centerpiece — a marigold-and-coral badge with the AadesiPo
 * wordmark flanked by two dice and a rupee mark. Purely graphic/typographic
 * (no illustrated art), and scales with the board so it reads at any size.
 */
function drawCenterEmblem(stage: Container, size: number, onEmblemTap: () => void) {
  const R = size * 0.155;
  const emblem = new Container();
  emblem.x = size / 2;
  emblem.y = size / 2;
  emblem.eventMode = "static";
  emblem.cursor = "pointer";
  emblem.hitArea = new Circle(0, 0, R);
  emblem.on("pointertap", onEmblemTap);

  const badge = new Graphics()
    .circle(0, 0, R)
    .fill({ color: EMBLEM_INK, alpha: 0.95 })
    .circle(0, 0, R)
    .stroke({ width: R * 0.1, color: EMBLEM_MARIGOLD })
    .circle(0, 0, R * 0.8)
    .stroke({ width: R * 0.035, color: EMBLEM_CORAL });
  emblem.addChild(badge);

  const word = new Text({
    text: "AadesiPo",
    style: new TextStyle({
      fill: EMBLEM_MARIGOLD,
      fontSize: R * 0.32,
      fontFamily: "Baloo 2, system-ui, sans-serif",
      fontWeight: "800",
    }),
  });
  word.anchor.set(0.5);
  word.y = -R * 0.12;
  emblem.addChild(word);

  const rowY = R * 0.4;
  drawDie(emblem, -R * 0.46, rowY, R * 0.3, DIE_FACE_5);
  drawDie(emblem, R * 0.46, rowY, R * 0.3, DIE_FACE_2);

  const rupee = new Text({
    text: "₹",
    style: new TextStyle({
      fill: EMBLEM_CORAL,
      fontSize: R * 0.48,
      fontFamily: "Baloo 2, system-ui, sans-serif",
      fontWeight: "800",
    }),
  });
  rupee.anchor.set(0.5);
  rupee.y = rowY;
  emblem.addChild(rupee);

  stage.addChild(emblem);
}

/** A single playful die for the center emblem: marigold face, dark pips. */
function drawDie(
  parent: Container,
  x: number,
  y: number,
  s: number,
  pips: readonly (readonly [number, number])[],
) {
  const g = new Graphics();
  g.roundRect(x - s / 2, y - s / 2, s, s, s * 0.22)
    .fill(EMBLEM_MARIGOLD)
    .stroke({ width: s * 0.06, color: EMBLEM_INK });
  for (const [ux, uy] of pips) {
    g.circle(x + ux * s, y + uy * s, s * 0.09).fill(EMBLEM_INK);
  }
  parent.addChild(g);
}

/** Creates the (initially hidden) overlay objects for one ownable tile and
 *  parents them to the tile's container, above its base graphics. */
function createTileOverlay(
  parent: Container,
  tile: Tile,
  rect: TileRect,
  cell: number,
): TileOverlay {
  const layout = tileTextLayout(rect, cell);
  const priceText = new Text({
    text: isOwnable(tile) ? formatRupeesCompact(tile.price) : "",
    style: makePriceLabelStyle(cell),
  });
  priceText.anchor.set(0.5);
  priceText.x = layout.priceX;
  priceText.y = layout.priceY;
  priceText.rotation = layout.rotation;
  priceText.visible = false;

  const ownerBadge = new Graphics();
  ownerBadge.visible = false;

  const ownerInitial = new Text({
    text: "",
    style: new TextStyle({
      fill: BADGE_TEXT,
      fontSize: cell * 0.2,
      fontFamily: "Inter, system-ui, sans-serif",
      fontWeight: "800",
    }),
  });
  ownerInitial.anchor.set(0.5);
  ownerInitial.visible = false;

  const buildings = new Graphics();

  parent.addChild(priceText, ownerBadge, ownerInitial, buildings);
  return { priceText, ownerBadge, ownerInitial, buildings };
}

/** Redraws the building row: `houses` little house icons, or one hotel. */
function drawBuildings(
  g: Graphics,
  tile: Tile,
  ownership: PropertyOwnership | undefined,
  rect: TileRect,
  cell: number,
) {
  g.clear();
  if (tile.type !== "property" || !ownership) return;

  const s = cell * 0.16;
  const cx = rect.x + rect.width / 2;
  const y = rect.y + cell * 0.32;

  if (ownership.hasHotel) {
    drawHotelIcon(g, cx - s * 0.8, y, s);
    return;
  }
  if (ownership.houses > 0) {
    const gap = s * 0.4;
    const totalW = ownership.houses * s + (ownership.houses - 1) * gap;
    let x = cx - totalW / 2;
    for (let i = 0; i < ownership.houses; i++) {
      drawHouseIcon(g, x, y, s);
      x += s + gap;
    }
  }
}

/** A little house: square body with a triangular roof. */
function drawHouseIcon(g: Graphics, x: number, y: number, s: number) {
  const roofH = s * 0.45;
  const bodyY = y + roofH;
  const bodyH = s - roofH;
  g.rect(x, bodyY, s, bodyH).fill(HOUSE_COLOR).stroke({ width: 0.75, color: ICON_STROKE });
  g.poly([x - s * 0.08, bodyY, x + s + s * 0.08, bodyY, x + s / 2, y])
    .fill(HOUSE_COLOR)
    .stroke({ width: 0.75, color: ICON_STROKE });
}

/** A hotel: one wider red block, distinct from the green houses. */
function drawHotelIcon(g: Graphics, x: number, y: number, s: number) {
  const w = s * 1.6;
  const roofH = s * 0.35;
  g.rect(x, y + roofH, w, s - roofH)
    .fill(HOTEL_COLOR)
    .stroke({ width: 0.75, color: ICON_STROKE });
  g.poly([x - s * 0.06, y + roofH, x + w + s * 0.06, y + roofH, x + w / 2, y])
    .fill(HOTEL_COLOR)
    .stroke({ width: 0.75, color: ICON_STROKE });
}
