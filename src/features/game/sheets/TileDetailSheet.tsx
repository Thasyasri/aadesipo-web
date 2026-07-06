import {
  BOARD,
  getTile,
  isOwnable,
  ownershipAt,
  type GameState,
  type PropertyOwnership,
  type PropertyTile,
  type TransitTile,
  type UtilityTile,
} from "@aadesipo/engine";
import { BottomSheet } from "@/components/BottomSheet";
import { GROUP_COLORS } from "@/theme/groupColors";
import type { PlayerSetup } from "@/state/gameStore";
import { formatRupees } from "@/utils/currency";

interface TileDetailSheetProps {
  game: GameState;
  players: readonly PlayerSetup[];
  /** Board position of the tile being inspected, or null when closed. */
  position: number | null;
  onClose: () => void;
}

/**
 * Tap-to-inspect detail for any ownable tile — readable at a normal text
 * size no matter how small the tile is on the board. Works for every tile,
 * owned or not, by the current player or anyone.
 */
export function TileDetailSheet({ game, players, position, onClose }: TileDetailSheetProps) {
  const tile = position !== null ? getTile(position) : null;
  return (
    <BottomSheet open={position !== null} onClose={onClose}>
      {tile && isOwnable(tile) ? <TileDetail game={game} players={players} tile={tile} /> : null}
    </BottomSheet>
  );
}

function TileDetail({
  game,
  players,
  tile,
}: {
  game: GameState;
  players: readonly PlayerSetup[];
  tile: PropertyTile | TransitTile | UtilityTile;
}) {
  const ownership = ownershipAt(game, tile.position);
  const ownerName = ownership?.ownerId
    ? (players.find((p) => p.id === ownership.ownerId)?.displayName ?? ownership.ownerId)
    : null;
  const swatch = tile.type === "property" ? GROUP_COLORS[tile.group] : "#5A6284";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span
          className="h-6 w-6 shrink-0 rounded-md"
          style={{ backgroundColor: swatch }}
          aria-hidden="true"
        />
        <h2 className="font-display text-title">{tile.name}</h2>
      </div>

      <div className="flex flex-col gap-2">
        <DetailRow label="Price" value={formatRupees(tile.price)} />
        <DetailRow label="Owner" value={ownerName ?? "Unowned"} />
        {tile.type === "property" && (
          <DetailRow label="Buildings" value={buildingsLabel(ownership)} />
        )}
        <DetailRow
          label="Status"
          value={ownership?.isMortgaged ? "Mortgaged" : "Not mortgaged"}
          valueClass={ownership?.isMortgaged ? "text-semantic-warn" : undefined}
        />
        <DetailRow label="Mortgage value" value={formatRupees(tile.mortgageValue)} />
      </div>

      <div>
        <h3 className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-secondary">
          {tile.type === "property" ? "Rent table" : "Rent"}
        </h3>
        <RentTable game={game} tile={tile} ownership={ownership} />
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between gap-4 text-body">
      <span className="text-text-secondary">{label}</span>
      <span
        className={`text-right font-semibold tabular-nums ${valueClass ?? "text-text-primary"}`}
      >
        {value}
      </span>
    </div>
  );
}

function buildingsLabel(ownership: PropertyOwnership | undefined): string {
  if (ownership?.hasHotel) return "Hotel";
  const houses = ownership?.houses ?? 0;
  if (houses === 0) return "None";
  return `${houses} house${houses === 1 ? "" : "s"}`;
}

/** Number of transit/utility tiles the given owner holds (drives set-size rent). */
function countOwnedOfType(game: GameState, ownerId: string, type: "transit" | "utility"): number {
  return BOARD.filter((t) => t.type === type).filter(
    (t) => ownershipAt(game, t.position)?.ownerId === ownerId,
  ).length;
}

function RentTable({
  game,
  tile,
  ownership,
}: {
  game: GameState;
  tile: PropertyTile | TransitTile | UtilityTile;
  ownership: PropertyOwnership | undefined;
}) {
  let rows: Array<{ label: string; value: string; current: boolean }> = [];

  if (tile.type === "property") {
    const houses = ownership?.houses ?? 0;
    const hotel = ownership?.hasHotel === true;
    rows = [
      { label: "Base rent", value: formatRupees(tile.rent.base), current: !hotel && houses === 0 },
      { label: "1 house", value: formatRupees(tile.rent.oneHouse), current: houses === 1 },
      { label: "2 houses", value: formatRupees(tile.rent.twoHouses), current: houses === 2 },
      { label: "3 houses", value: formatRupees(tile.rent.threeHouses), current: houses === 3 },
      { label: "4 houses", value: formatRupees(tile.rent.fourHouses), current: houses === 4 },
      { label: "Hotel", value: formatRupees(tile.rent.hotel), current: hotel },
    ];
  } else if (tile.type === "transit") {
    const owned = ownership?.ownerId ? countOwnedOfType(game, ownership.ownerId, "transit") : 0;
    rows = tile.rentBySetSize.map((amount, i) => ({
      label: `${i + 1} station${i === 0 ? "" : "s"} owned`,
      value: formatRupees(amount),
      current: owned === i + 1,
    }));
  } else {
    const owned = ownership?.ownerId ? countOwnedOfType(game, ownership.ownerId, "utility") : 0;
    rows = tile.diceMultiplierBySetSize.map((mult, i) => ({
      label: `${i + 1} utilit${i === 0 ? "y" : "ies"} owned`,
      value: `dice roll × ${mult}`,
      current: owned === i + 1,
    }));
  }

  return (
    <div className="flex flex-col gap-1">
      {rows.map((row) => (
        <div
          key={row.label}
          className={`flex justify-between gap-4 text-body ${
            row.current ? "font-bold text-brand-primary" : "text-text-secondary"
          }`}
        >
          <span>{row.label}</span>
          <span className="tabular-nums">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
