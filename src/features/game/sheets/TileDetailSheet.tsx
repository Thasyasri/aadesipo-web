import {
  BOARD,
  CHANCE_TABLE,
  FUNNY_TABLE,
  GO_SALARY,
  JAIL_BAIL_COST,
  MAX_JAIL_TURNS,
  TAX_PER_COLOUR_PROPERTY,
  TAX_PER_HOTEL,
  TAX_PER_HOUSE,
  TAX_PER_TRANSIT_UTILITY,
  calculateRent,
  getTile,
  hasMonopoly,
  isOwnable,
  ownershipAt,
  type EventOutcome,
  type GameState,
  type PropertyOwnership,
  type PropertyTile,
  type Tile,
  type TransitTile,
  type UtilityTile,
} from "@aadesipo/engine";
import { BottomSheet } from "@/components/BottomSheet";
import { GROUP_COLORS } from "@/theme/groupColors";
import type { PlayerSetup } from "@/state/gameStore";
import { formatRupees } from "@/utils/currency";
import { tileNameWithCode } from "@/utils/tileCode";

// A subtle accent dot per non-ownable tile type, echoing its board role.
const TYPE_ACCENT: Record<string, string> = {
  tax: "#FF5D5D",
  chance: "#FFB020",
  "funny-event": "#FFB020",
  go: "#2FBF71",
  jail: "#9AA3C4",
  "go-to-jail": "#FF5D5D",
  "free-parking": "#9AA3C4",
};

const DICE_SUMS = Array.from({ length: 11 }, (_, i) => i + 2); // 2 through 12

interface TileDetailSheetProps {
  game: GameState;
  players: readonly PlayerSetup[];
  /** Board position of the tile being inspected, or null when closed. */
  position: number | null;
  onClose: () => void;
}

/**
 * Tap-to-inspect detail for ANY tile — the board only shows a short code, so
 * this sheet is where the full name and details live. Readable at a normal
 * text size no matter how small the tile is on the board.
 */
export function TileDetailSheet({ game, players, position, onClose }: TileDetailSheetProps) {
  const tile = position !== null ? getTile(position) : null;
  return (
    <BottomSheet open={position !== null} onClose={onClose}>
      {tile ? <TileContent game={game} players={players} tile={tile} /> : null}
    </BottomSheet>
  );
}

/** Routes a tile to the right detail view by type. */
function TileContent({
  game,
  players,
  tile,
}: {
  game: GameState;
  players: readonly PlayerSetup[];
  tile: Tile;
}) {
  if (isOwnable(tile)) return <TileDetail game={game} players={players} tile={tile} />;

  const accent = TYPE_ACCENT[tile.type] ?? "#5A6284";

  switch (tile.type) {
    case "tax":
      return (
        <SimpleDetail
          title={tile.name}
          accent={accent}
          description={
            tile.variant === "income"
              ? "Land here and pay income tax to the bank — it scales with the properties you own."
              : "Land here and pay luxury tax to the bank — it scales with the buildings you own."
          }
          rows={
            tile.variant === "income"
              ? [
                  { label: "Per coloured property", value: formatRupees(TAX_PER_COLOUR_PROPERTY) },
                  { label: "Per station / utility", value: formatRupees(TAX_PER_TRANSIT_UTILITY) },
                ]
              : [
                  { label: "Per house", value: formatRupees(TAX_PER_HOUSE) },
                  { label: "Per hotel", value: formatRupees(TAX_PER_HOTEL) },
                ]
          }
        />
      );
    case "chance":
      return (
        <EventDetail
          title="Chance"
          accent={accent}
          description="Landing here triggers an outcome set by your exact dice sum — there's no random draw, so you can read the whole table."
          table={CHANCE_TABLE}
        />
      );
    case "funny-event":
      return (
        <EventDetail
          title={tile.name}
          accent={accent}
          description="A desi twist decided by your exact dice sum — no random draw."
          table={FUNNY_TABLE}
        />
      );
    case "go":
      return (
        <SimpleDetail
          title="GO"
          accent={accent}
          description="Collect your salary each time you pass or land on GO."
          rows={[{ label: "Salary", value: formatRupees(GO_SALARY) }]}
        />
      );
    case "jail":
      return (
        <SimpleDetail
          title={tile.name}
          accent={accent}
          description="Just visiting costs nothing. If you're sent to jail, get out by paying bail, rolling doubles, or serving your time."
          rows={[
            { label: "Bail", value: formatRupees(JAIL_BAIL_COST) },
            { label: "Max turns held", value: String(MAX_JAIL_TURNS) },
          ]}
        />
      );
    case "go-to-jail":
      return (
        <SimpleDetail
          title="Go To Jail"
          accent={accent}
          description="Land here and go straight to Jail — do not pass GO, do not collect your salary."
        />
      );
    case "free-parking":
      return (
        <SimpleDetail
          title="Free Parking"
          accent={accent}
          description={
            game.houseRules.freeParkingJackpot
              ? "The Free Parking jackpot is on — land here to sweep the whole pot."
              : "A safe resting spot — nothing happens when you land here."
          }
          rows={
            game.houseRules.freeParkingJackpot
              ? [{ label: "Current pot", value: formatRupees(game.freeParkingPot) }]
              : undefined
          }
        />
      );
  }
}

/** Header + description + optional key/value rows, for non-ownable tiles. */
function SimpleDetail({
  title,
  accent,
  description,
  rows,
}: {
  title: string;
  accent: string;
  description: string;
  rows?: ReadonlyArray<{ label: string; value: string }>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span
          className="h-6 w-6 shrink-0 rounded-md"
          style={{ backgroundColor: accent }}
          aria-hidden="true"
        />
        <h2 className="font-display text-title">{title}</h2>
      </div>
      <p className="text-body text-text-secondary">{description}</p>
      {rows && rows.length > 0 && (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <DetailRow key={r.label} label={r.label} value={r.value} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Header + description + the full dice-sum outcome table for a Chance /
 *  funny-event tile. */
function EventDetail({
  title,
  accent,
  description,
  table,
}: {
  title: string;
  accent: string;
  description: string;
  table: Readonly<Record<number, EventOutcome>>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span
          className="h-6 w-6 shrink-0 rounded-md"
          style={{ backgroundColor: accent }}
          aria-hidden="true"
        />
        <h2 className="font-display text-title">{title}</h2>
      </div>
      <p className="text-body text-text-secondary">{description}</p>
      <ul className="flex flex-col gap-2">
        {DICE_SUMS.map((sum) => (
          <li key={sum} className="flex gap-2 text-body">
            <span className="w-16 shrink-0 font-semibold tabular-nums text-text-secondary">
              Roll {sum}
            </span>
            <span className="text-text-primary">{table[sum]?.text}</span>
          </li>
        ))}
      </ul>
    </div>
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
  // The single rent this tile charges *right now* (rents don't stack — it's the
  // one tier for the current buildings/set). Only meaningful once owned.
  const rentNow = currentRentLabel(game, tile, ownership);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span
          className="h-6 w-6 shrink-0 rounded-md"
          style={{ backgroundColor: swatch }}
          aria-hidden="true"
        />
        <h2 className="font-display text-title">{tileNameWithCode(tile.name)}</h2>
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
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-caption font-semibold uppercase tracking-wide text-text-secondary">
            {tile.type === "property" ? "Rent table" : "Rent"}
          </h3>
          {rentNow && (
            <span className="text-body font-bold text-brand-primary">Now: {rentNow}</span>
          )}
        </div>
        <RentTable game={game} tile={tile} ownership={ownership} />
        <p className="mt-2 text-micro text-text-disabled">
          Rent is the single amount for the current level — it doesn&apos;t add up across tiers.
        </p>
      </div>
    </div>
  );
}

/**
 * The rent this tile charges right now — a single tier, not a sum. Null until
 * owned. Utilities depend on the dice, so they read as a multiplier.
 */
function currentRentLabel(
  game: GameState,
  tile: PropertyTile | TransitTile | UtilityTile,
  ownership: PropertyOwnership | undefined,
): string | null {
  if (!ownership?.ownerId) return null;
  if (ownership.isMortgaged) return "Mortgaged — ₹0";
  if (tile.type === "utility") {
    const owned = countOwnedOfType(game, ownership.ownerId, "utility");
    const mult = tile.diceMultiplierBySetSize[Math.min(Math.max(owned, 1), 2) - 1] ?? 0;
    return `dice × ${mult}`;
  }
  return formatRupees(calculateRent(game, tile.position, 7));
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
    // Owning the whole colour set doubles the base rent on the unimproved tile.
    const monopoly = ownership?.ownerId ? hasMonopoly(game, ownership.ownerId, tile.group) : false;
    rows = [
      {
        label: monopoly ? "Base rent (full set ×2)" : "Base rent",
        value: formatRupees(monopoly ? tile.rent.base * 2 : tile.rent.base),
        current: !hotel && houses === 0,
      },
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
