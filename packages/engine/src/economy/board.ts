/**
 * The board is data, not code — rebalancing means editing numbers here,
 * never touching rules/. Names are placeholder desi-city flavor; the
 * real content pass (roadmap item 18) replaces these, but the shape
 * (8 groups, 22 properties, 4 transit, 2 utility) is the structural
 * decision and is what the rest of the engine is built against.
 */

export type TileType =
  | "go"
  | "property"
  | "transit"
  | "utility"
  | "tax"
  | "chance"
  | "funny-event"
  | "jail"
  | "go-to-jail"
  | "free-parking";

export type PropertyGroup =
  "brown" | "light-blue" | "pink" | "orange" | "red" | "yellow" | "green" | "dark-blue";

export interface RentTiers {
  readonly base: number;
  readonly oneHouse: number;
  readonly twoHouses: number;
  readonly threeHouses: number;
  readonly fourHouses: number;
  readonly hotel: number;
}

export interface PropertyTile {
  readonly type: "property";
  readonly position: number;
  readonly name: string;
  readonly group: PropertyGroup;
  readonly price: number;
  readonly mortgageValue: number;
  readonly buildingCost: number;
  readonly rent: RentTiers;
}

export interface TransitTile {
  readonly type: "transit";
  readonly position: number;
  readonly name: string;
  readonly price: number;
  readonly mortgageValue: number;
  readonly rentBySetSize: readonly [number, number, number, number];
}

export interface UtilityTile {
  readonly type: "utility";
  readonly position: number;
  readonly name: string;
  readonly price: number;
  readonly mortgageValue: number;
  readonly diceMultiplierBySetSize: readonly [number, number];
}

export interface TaxTile {
  readonly type: "tax";
  readonly position: number;
  readonly name: string;
  readonly amount: number;
}

export interface SimpleTile {
  readonly type: "go" | "chance" | "funny-event" | "jail" | "go-to-jail" | "free-parking";
  readonly position: number;
  readonly name: string;
}

export type Tile = PropertyTile | TransitTile | UtilityTile | TaxTile | SimpleTile;

export const BOARD_SIZE = 40;
export const GO_SALARY = 200;
export const JAIL_POSITION = 10;
export const GO_TO_JAIL_POSITION = 30;
export const MAX_JAIL_TURNS = 3;
export const JAIL_BAIL_COST = 50;

interface GroupSpec {
  readonly group: PropertyGroup;
  readonly basePrice: number;
  readonly priceStep: number;
  readonly buildingCost: number;
  readonly names: readonly string[];
}

const GROUP_SPECS: readonly GroupSpec[] = [
  {
    group: "brown",
    basePrice: 100,
    priceStep: 20,
    buildingCost: 50,
    names: ["Nizamabad", "Karimnagar"],
  },
  {
    group: "light-blue",
    basePrice: 140,
    priceStep: 20,
    buildingCost: 50,
    names: ["Khammam", "Nalgonda", "Warangal"],
  },
  {
    group: "pink",
    basePrice: 180,
    priceStep: 20,
    buildingCost: 100,
    names: ["Kadapa", "Rajahmundry", "Kakinada"],
  },
  {
    group: "orange",
    basePrice: 220,
    priceStep: 20,
    buildingCost: 100,
    names: ["Nellore", "Guntur", "Visakhapatnam"],
  },
  {
    group: "red",
    basePrice: 260,
    priceStep: 20,
    buildingCost: 150,
    names: ["Vijayawada", "Tirupati", "Amaravati"],
  },
  {
    group: "yellow",
    basePrice: 300,
    priceStep: 20,
    buildingCost: 150,
    names: ["Gachibowli", "Banjara Hills", "Jubilee Hills"],
  },
  {
    group: "green",
    basePrice: 340,
    priceStep: 20,
    buildingCost: 200,
    names: ["Charminar", "Golconda Fort", "Hussain Sagar"],
  },
  {
    group: "dark-blue",
    basePrice: 380,
    priceStep: 40,
    buildingCost: 200,
    names: ["Gateway of India", "Taj Mahal"],
  },
];

/**
 * The GROUP_SPECS above lay properties out in contiguous price tiers, which
 * left six pairs of same-color tiles sitting directly next to each other on
 * the board (positions 8-9, 13-14, 18-19, 23-24, 26-27, 31-32 — each the
 * back-to-back members of a 3-tile group). This remaps just those clashing
 * members by swapping the second one of each pair with a member of an
 * adjacent tier, so no two directly-adjacent board positions share a group.
 * Group sizes are preserved (still two groups of 2 and six of 3), and only
 * the `group` field changes — name, position, price, and buildingCost stay
 * exactly as generated, so rent/mortgage/building costs are unaffected.
 */
const GROUP_OVERRIDES: Readonly<Record<number, PropertyGroup>> = {
  9: "pink", // Warangal: light-blue -> pink   (swap with Kakinada)
  14: "light-blue", // Kakinada: pink -> light-blue
  19: "red", // Visakhapatnam: orange -> red   (swap with Amaravati)
  24: "orange", // Amaravati: red -> orange
  27: "green", // Banjara Hills: yellow -> green (swap with Golconda Fort)
  32: "yellow", // Golconda Fort: green -> yellow
};

function rentTiersFor(price: number): RentTiers {
  const base = Math.round(price * 0.08);
  return {
    base,
    oneHouse: base * 5,
    twoHouses: base * 15,
    threeHouses: base * 30,
    fourHouses: base * 45,
    hotel: base * 60,
  };
}

function buildPropertyTiles(positions: readonly number[]): PropertyTile[] {
  const tiles: PropertyTile[] = [];
  let posIndex = 0;

  for (const spec of GROUP_SPECS) {
    for (let i = 0; i < spec.names.length; i++) {
      const price = spec.basePrice + spec.priceStep * i;
      const position = positions[posIndex];
      if (position === undefined) {
        throw new Error("buildPropertyTiles: ran out of positions — board layout mismatch");
      }
      tiles.push({
        type: "property",
        position,
        name: spec.names[i]!,
        group: GROUP_OVERRIDES[position] ?? spec.group,
        price,
        mortgageValue: Math.round(price / 2),
        buildingCost: spec.buildingCost,
        rent: rentTiersFor(price),
      });
      posIndex++;
    }
  }

  return tiles;
}

const PROPERTY_POSITIONS = [
  1, 3, 6, 8, 9, 11, 13, 14, 16, 18, 19, 21, 23, 24, 26, 27, 29, 31, 32, 34, 37, 39,
];
const TRANSIT_POSITIONS = [5, 15, 25, 35] as const;
const UTILITY_POSITIONS = [12, 28] as const;

const PROPERTY_TILES = buildPropertyTiles(PROPERTY_POSITIONS);

const TRANSIT_NAMES = [
  "Secunderabad Junction",
  "Kacheguda Station",
  "Begumpet Station",
  "Falaknuma Station",
];
const TRANSIT_TILES: TransitTile[] = TRANSIT_POSITIONS.map((position, i) => ({
  type: "transit",
  position,
  name: TRANSIT_NAMES[i]!,
  price: 200,
  mortgageValue: 100,
  rentBySetSize: [25, 50, 100, 200],
}));

const UTILITY_NAMES = ["Telangana Power Grid", "Godavari Water Board"];
const UTILITY_TILES: UtilityTile[] = UTILITY_POSITIONS.map((position, i) => ({
  type: "utility",
  position,
  name: UTILITY_NAMES[i]!,
  price: 150,
  mortgageValue: 75,
  diceMultiplierBySetSize: [4, 10],
}));

const SIMPLE_TILES: SimpleTile[] = [
  { type: "go", position: 0, name: "GO" },
  { type: "jail", position: JAIL_POSITION, name: "Jail / Just Visiting" },
  { type: "go-to-jail", position: GO_TO_JAIL_POSITION, name: "Go To Jail" },
  { type: "free-parking", position: 20, name: "Free Parking" },
  { type: "chance", position: 7, name: "Chance" },
  { type: "chance", position: 22, name: "Chance" },
  { type: "chance", position: 36, name: "Chance" },
  { type: "funny-event", position: 2, name: "Sarpanch Gari Dabba" },
  { type: "funny-event", position: 17, name: "Sarpanch Gari Dabba" },
  { type: "funny-event", position: 33, name: "Sarpanch Gari Dabba" },
];

const TAX_TILES: TaxTile[] = [
  { type: "tax", position: 4, name: "Income Tax", amount: 200 },
  { type: "tax", position: 38, name: "Luxury Tax", amount: 100 },
];

const ALL_TILES: Tile[] = [
  ...PROPERTY_TILES,
  ...TRANSIT_TILES,
  ...UTILITY_TILES,
  ...SIMPLE_TILES,
  ...TAX_TILES,
].sort((a, b) => a.position - b.position);

if (ALL_TILES.length !== BOARD_SIZE) {
  throw new Error(
    `Board config error: expected ${BOARD_SIZE} tiles, got ${ALL_TILES.length}. ` +
      "Every position 0-39 must be filled exactly once.",
  );
}
for (let i = 0; i < BOARD_SIZE; i++) {
  if (ALL_TILES[i]?.position !== i) {
    throw new Error(`Board config error: position ${i} is missing or duplicated.`);
  }
}
// No two directly-adjacent board positions may share a property group, so a
// color band never abuts the same color (checked around the loop, incl. 39->0).
for (let i = 0; i < BOARD_SIZE; i++) {
  const a = ALL_TILES[i];
  const b = ALL_TILES[(i + 1) % BOARD_SIZE];
  if (a?.type === "property" && b?.type === "property" && a.group === b.group) {
    throw new Error(
      `Board config error: adjacent positions ${a.position} and ${b.position} ` +
        `both belong to group "${a.group}".`,
    );
  }
}

/** The canonical 40-tile board, indexed by position. Frozen — this is config, not state. */
export const BOARD: readonly Tile[] = Object.freeze(ALL_TILES);

export function getTile(position: number): Tile {
  const tile = BOARD[((position % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE];
  if (!tile) throw new Error(`getTile: no tile at position ${position}`);
  return tile;
}

export function isOwnable(tile: Tile): tile is PropertyTile | TransitTile | UtilityTile {
  return tile.type === "property" || tile.type === "transit" || tile.type === "utility";
}

export function propertiesInGroup(group: PropertyGroup): readonly PropertyTile[] {
  return PROPERTY_TILES.filter((t) => t.group === group);
}
