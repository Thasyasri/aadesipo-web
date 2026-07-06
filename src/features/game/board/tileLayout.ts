/**
 * Standard square-perimeter layout: 11 tiles per side (4 corners +
 * 9 edge tiles each), matching the board shape packages/engine's
 * economy config was built against.
 *
 * GO sits at the bottom-right corner; play proceeds counter-clockwise —
 * bottom row right-to-left, left column bottom-to-top, top row
 * left-to-right, right column top-to-bottom.
 */

export interface TileRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Rotation in radians for tile labels, so text reads "inward". */
  readonly rotation: number;
}

const TILES_PER_SIDE = 11;

export function computeTileRect(position: number, boardSize: number): TileRect {
  const cell = boardSize / TILES_PER_SIDE;
  const corner = cell;

  // Bottom row: positions 0 (GO, corner) through 10 (Jail, corner).
  if (position <= 10) {
    const i = position;
    const isCorner = i === 0 || i === 10;
    const x = boardSize - corner - i * cell;
    return {
      x,
      y: boardSize - corner,
      width: isCorner ? corner : cell,
      height: corner,
      rotation: 0,
    };
  }

  // Left column: positions 11 through 20 (Free Parking, corner).
  if (position <= 20) {
    const j = position - 10;
    const isCorner = j === 10;
    const y = boardSize - corner - j * cell;
    return { x: 0, y, width: corner, height: isCorner ? corner : cell, rotation: Math.PI / 2 };
  }

  // Top row: positions 21 through 30 (Go-To-Jail, corner).
  if (position <= 30) {
    const i = position - 20;
    const isCorner = i === 10;
    const x = corner + (i - 1) * cell;
    return { x, y: 0, width: isCorner ? corner : cell, height: corner, rotation: Math.PI };
  }

  // Right column: positions 31 through 39 (no corner — 0/GO closes the loop).
  const k = position - 30;
  const y = corner + (k - 1) * cell;
  return { x: boardSize - corner, y, width: corner, height: cell, rotation: -Math.PI / 2 };
}

export function boardCenter(boardSize: number): { x: number; y: number } {
  return { x: boardSize / 2, y: boardSize / 2 };
}
