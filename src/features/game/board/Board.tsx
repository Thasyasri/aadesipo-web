import { useEffect, useRef, useState } from "react";
import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
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
import { tileCode } from "@/utils/tileCode";

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
  /** Fires on the edges of "a token is moving". The game screen gates the whole
   *  turn on this: no AI thinking, no player controls, no landing sheets while
   *  a pawn is still walking. */
  onAnimatingChange?: (animating: boolean) => void;
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

// A dice-driven move holds the token in place this long before walking, so it
// steps out only once the roll has been revealed (matches DiceCeremony's
// TUMBLE_MS ~700ms) rather than moving while the dice are still tumbling.
// Counted down inside the ticker (NOT a setTimeout) so no re-render can cancel
// a pending walk mid-flight.
export const WALK_START_DELAY_MS = 720;

// Duration of one tile-to-tile hop. Deliberately slow so a player can watch —
// and count — the pawn step across each tile.
const HOP_MS = 500;

// EVERY move is walked one tile at a time — a roll of 12 steps twelve times,
// and a long "advance to tile" event never teleports. To keep a 30-tile jump
// watchable rather than interminable, the per-hop duration compresses so any
// single walk fits inside this budget. Short moves (<= 12 tiles) are unaffected
// and keep the full, countable HOP_MS pace.
const WALK_TIME_BUDGET_MS = 6000;
const MIN_HOP_MS = 120;

function hopDurationFor(steps: number): number {
  if (steps <= 0) return HOP_MS;
  return Math.max(MIN_HOP_MS, Math.min(HOP_MS, Math.round(WALK_TIME_BUDGET_MS / steps)));
}

// Premium navy board (D3a) — matches the app's --color-bg-* / text tokens so
// the board reads as the same world as the surrounding UI. The board is a dark
// focal object in both themes (like a physical board); the chrome around it
// follows the light/dark toggle.
const BG_BASE = hexToPixiColor("#121726");
const BG_SURFACE = hexToPixiColor("#20273A");
const TEXT_PRIMARY = hexToPixiColor("#F5EBD7");
const TEXT_MUTED = hexToPixiColor("#8A92A5");
const HOUSE_COLOR = hexToPixiColor(SEMANTIC_COLORS.success); // green — houses
const HOTEL_COLOR = hexToPixiColor(SEMANTIC_COLORS.error); // red — hotel
const ICON_STROKE = hexToPixiColor("#0B0E1A"); // near-black outline so icons read on any band
const MORTGAGED_ALPHA = 0.45;
// Owner badge: a neutral white chip with a dark initial — readable on any
// group-band color and independent of the player's assigned color.
const BADGE_FILL = TEXT_PRIMARY;
const BADGE_STROKE = BG_BASE;
const BADGE_TEXT = hexToPixiColor("#141A33");

// Center emblem palette (premium gold + coral, per the app brand).
const EMBLEM_MARIGOLD = hexToPixiColor("#E6B54A");
const EMBLEM_CORAL = hexToPixiColor("#EF6A5B");
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

// The board shows only the short code; `tileCode` and the code map live in the
// shared @/utils/tileCode module so text surfaces can render `Name (CODE)`.
const boardTileLabel = tileCode;

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
    fontFamily: "Manrope, system-ui, sans-serif",
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
    fontFamily: "Manrope, system-ui, sans-serif",
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
  /** Milliseconds still to wait before this token's queued walk begins (the
   *  dice reveal). Ticked down each frame; while it's > 0 with a queued walk
   *  the token is held EXACTLY in place — no easing — so it can't drift toward
   *  the destination and then snap back when the walk starts. */
  walkDelay: number;
  /** Per-hop duration for the walk currently queued (see hopDurationFor). */
  hopMs: number;
}

/** A token is "busy" while it is waiting to walk, walking, or mid-hop. Turn
 *  progression is gated on no token being busy. */
function isTokenBusy(t: TokenSprite): boolean {
  return t.hop !== null || t.queue.length > 0 || t.walkDelay > 0;
}

/** Darken a 0xRRGGBB colour (f < 1) — used for the pawn's shaded side/base. */
function shade(hex: number, f: number): number {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((hex >> s) & 255) * f)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
/** Mix a colour toward white (f = amount) — the pawn's lit side / specular. */
function tint(hex: number, f: number): number {
  const ch = (s: number) => {
    const c = (hex >> s) & 255;
    return Math.round(c + (255 - c) * f);
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * A chess pawn, drawn to read as a small 3D piece rather than a flat coin:
 * a ground shadow, a turned base, a tapered stem, a collar, and a domed head —
 * with the light coming from the upper left (a rim highlight on the head, a
 * darker right flank) so it has volume at token size.
 *
 * `r` is the piece's unit radius; the pawn stands ~2.5r tall and ~1.9r wide,
 * which keeps it inside the 16px seat spacing even with five on one tile.
 */
function buildPawn(colorHex: number, r: number): Graphics {
  const body = colorHex;
  const dark = shade(colorHex, 0.6);
  const mid = shade(colorHex, 0.82);
  const light = tint(colorHex, 0.5);
  const g = new Graphics();

  // Ground shadow — sells the "standing on the tile" read.
  g.ellipse(0, r * 1.02, r * 0.92, r * 0.28).fill({ color: 0x000000, alpha: 0.38 });

  // Turned base: a wide foot with a lip above it.
  g.ellipse(0, r * 0.8, r * 0.94, r * 0.3).fill(dark);
  g.roundRect(-r * 0.66, r * 0.44, r * 1.32, r * 0.34, r * 0.14).fill(body);

  // Tapered stem, with the right flank shaded.
  g.poly([-r * 0.36, r * 0.5, r * 0.36, r * 0.5, r * 0.21, -r * 0.1, -r * 0.21, -r * 0.1]).fill(
    body,
  );
  g.poly([r * 0.06, r * 0.5, r * 0.36, r * 0.5, r * 0.21, -r * 0.1, r * 0.04, -r * 0.1]).fill({
    color: mid,
    alpha: 0.9,
  });

  // Collar, then the domed head.
  g.ellipse(0, -r * 0.1, r * 0.46, r * 0.16).fill(dark);
  g.circle(0, -r * 0.6, r * 0.45).fill(body);
  // Upper-left specular, lower-right shade — the volume cue.
  g.circle(-r * 0.15, -r * 0.72, r * 0.17).fill({ color: light, alpha: 0.9 });
  g.circle(r * 0.16, -r * 0.5, r * 0.2).fill({ color: mid, alpha: 0.45 });

  // A single dark contour keeps it legible against the navy board.
  g.circle(0, -r * 0.6, r * 0.45).stroke({ width: 1.2, color: BG_BASE, alpha: 0.85 });
  g.ellipse(0, r * 0.8, r * 0.94, r * 0.3).stroke({ width: 1.2, color: BG_BASE, alpha: 0.85 });
  return g;
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

export function Board({
  game,
  players,
  events = [],
  onSelectTile,
  onSelectEmblem,
  onAnimatingChange,
}: BoardProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  // The ticker lives outside React, so reach the latest callback through a ref
  // and only fire it on the busy/idle edges.
  const onAnimatingChangeRef = useRef(onAnimatingChange);
  onAnimatingChangeRef.current = onAnimatingChange;
  const busyRef = useRef(false);
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
        drawStaticBoard(world, size, tileContainers);

        const cell = size / 11;
        const hopHeight = cell * 0.5; // how high the token arcs between tiles
        app.ticker.add((ticker) => {
          const dt = ticker.deltaMS;
          let anyBusy = false;

          for (const token of tokens.values()) {
            if (token.walkDelay > 0 && token.queue.length > 0) {
              // Waiting out the dice reveal. Hold the token EXACTLY where it is
              // — deliberately no easing — so it never drifts toward the
              // destination and snap back when the walk begins.
              token.walkDelay -= dt;
              anyBusy = true;
              continue;
            }

            if (token.hop) {
              // A single tile-to-tile bounce: ease across horizontally while
              // arcing up and back down, with a little pop at the apex — the
              // Ludo-style hop.
              token.hop.elapsed += dt;
              const p = Math.min(1, token.hop.elapsed / token.hopMs);
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
              // Settled: ease gently to the resting seat. Frame-rate normalised
              // so a 120Hz display doesn't snap twice as fast as a 60Hz one.
              const k = 1 - Math.pow(1 - 0.2, dt / 16.67);
              token.container.x += (token.targetX - token.container.x) * k;
              token.container.y += (token.targetY - token.container.y) * k;
            }

            if (isTokenBusy(token)) anyBusy = true;
          }

          // Publish the animation gate exactly on its edges. Turn progression
          // (AI thinking, human controls, landing sheets) waits on this.
          if (anyBusy !== busyRef.current) {
            busyRef.current = anyBusy;
            onAnimatingChangeRef.current?.(anyBusy);
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
      // The ticker owned the animation gate; tearing it down mid-walk (a resize
      // destroys and rebuilds the app) would otherwise leave the whole turn
      // blocked on an `animating` that can never clear. Release it here.
      if (busyRef.current) {
        busyRef.current = false;
        onAnimatingChangeRef.current?.(false);
      }
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
        const r = Math.min(cell, 24) * 0.34;
        const pawn = buildPawn(hexToPixiColor(PLAYER_COLORS[i % PLAYER_COLORS.length]!), r);
        // The seat initial sits on the pawn's base — the widest part — so five
        // same-shaped pieces on one tile are still told apart at a glance.
        const label = new Text({
          text: initialForRef.current(player.id),
          style: new TextStyle({
            fill: BG_BASE,
            fontSize: Math.max(8, Math.round(r * 1.05)),
            fontWeight: "700",
            fontFamily: "Manrope",
          }),
        });
        label.anchor.set(0.5);
        label.y = r * 0.6;
        container.addChild(pawn, label);
        container.x = targetX;
        container.y = targetY;
        world.addChild(container);
        token = { container, targetX, targetY, queue: [], hop: null, walkDelay: 0, hopMs: HOP_MS };
        tokensRef.current.set(player.id, token);
      }
      // Only re-seat an IDLE token. A busy one already owns its destination (set
      // by startWalk); overwriting it here — which happens on every unrelated
      // game update, e.g. a rival's dispatch — is what made the pawn drift
      // toward its target and then jump back when the walk finally started.
      if (!isTokenBusy(token)) {
        token.targetX = targetX;
        token.targetY = targetY;
      }
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
        // EVERY move walks, one tile at a time — including a 12 and including a
        // long "advance to tile" event. Nothing teleports; hopDurationFor keeps
        // the long ones watchable by stepping faster, not by skipping.
        for (let k = 1; k <= count; k++) push(ev.playerId, (((ev.from + dir * k) % 40) + 40) % 40);
        if (count === 0) push(ev.playerId, ev.to);
      } else if (ev.type === "SentToJail") {
        // "Go directly to Jail" is a teleport by rule, not a walk.
        push(ev.playerId, JAIL_POSITION);
      }
    }
    if (paths.size === 0) return;

    const waypoint = (playerId: string, pos: number): [number, number] => {
      const [ox, oy] = SEAT_OFFSETS[(indexOf.get(playerId) ?? 0) % SEAT_OFFSETS.length]!;
      const rect = computeTileRect(pos, size);
      return [rect.x + rect.width / 2 + ox, rect.y + rect.height / 2 + oy];
    };
    // A dice roll reveals the number first (the dice ceremony), so the mover
    // holds still for WALK_START_DELAY_MS and then steps out. That delay is
    // counted down by the ticker rather than a setTimeout: this effect re-runs
    // on every dispatch, and its cleanup used to CANCEL a still-pending walk —
    // which is exactly how a roll could end up gliding straight to its tile
    // instead of stepping.
    const delay = events.some((e) => e.type === "DiceRolled") ? WALK_START_DELAY_MS : 0;

    for (const [playerId, tilePositions] of paths) {
      const token = tokensRef.current.get(playerId);
      if (!token) continue;
      token.queue = tilePositions.map((pos) => waypoint(playerId, pos));
      token.hop = null;
      token.walkDelay = delay;
      token.hopMs = hopDurationFor(tilePositions.length);
      const last = token.queue[token.queue.length - 1];
      if (last) [token.targetX, token.targetY] = last; // rest at the destination
    }
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

      // Price — always shown (like a real board). It sits on the outer rim,
      // clear of the owner badge on the inner colour band, so both read at once.
      overlay.priceText.visible = true;

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

  // Taps are handled at the DOM level (not via Pixi's event system): we hit-test
  // the tap coordinates against the tile rects and the centre emblem ourselves.
  // Pixi's pointer events proved unreliable on some real touch devices (a
  // high-DPI coordinate-mapping issue that headless emulation didn't show); a
  // plain DOM click on the canvas host fires consistently everywhere.
  const handleBoardTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const host = hostRef.current;
    if (!host || size <= 0) return;
    const rect = host.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * size;
    const y = ((e.clientY - rect.top) / rect.height) * size;

    // Centre emblem (opens the event tables) — same radius drawCenterEmblem uses.
    if (Math.hypot(x - size / 2, y - size / 2) <= size * 0.155) {
      onSelectEmblemRef.current?.();
      return;
    }
    for (const tile of BOARD) {
      const tr = computeTileRect(tile.position, size);
      if (x >= tr.x && x <= tr.x + tr.width && y >= tr.y && y <= tr.y + tr.height) {
        onSelectTileRef.current?.(tile.position);
        return;
      }
    }
  };

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
          onClick={handleBoardTap}
          className="cursor-pointer overflow-hidden rounded-lg"
          style={{ width: size, height: size }}
        />
      </div>
    </div>
  );
}

function drawStaticBoard(stage: Container, size: number, tileContainers: Map<number, Container>) {
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

    // Taps are hit-tested at the DOM level (see handleBoardTap) — every tile is
    // tap-to-inspect there, so no per-tile Pixi event wiring is needed here.
    stage.addChild(container);
    tileContainers.set(tile.position, container);
  }

  drawCenterEmblem(stage, size);
}

/**
 * The board's centerpiece — a marigold-and-coral badge with the AadesiPo
 * wordmark flanked by two dice and a rupee mark. Purely graphic/typographic
 * (no illustrated art), and scales with the board so it reads at any size.
 */
function drawCenterEmblem(stage: Container, size: number) {
  const R = size * 0.155;
  const emblem = new Container();
  emblem.x = size / 2;
  emblem.y = size / 2;
  // The emblem tap (opens the event tables) is hit-tested at the DOM level too.

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
      fontFamily: "Fraunces, Georgia, serif",
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
      fontFamily: "Fraunces, Georgia, serif",
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
      fontFamily: "Manrope, system-ui, sans-serif",
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
