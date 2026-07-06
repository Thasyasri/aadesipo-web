import { describe, expect, it } from "vitest";
import {
  BOARD,
  BOARD_SIZE,
  getTile,
  isOwnable,
  propertiesInGroup,
  type PropertyGroup,
  type PropertyTile,
} from "../src/economy/board.js";

describe("BOARD", () => {
  it("has exactly 40 tiles, one per position, in order", () => {
    expect(BOARD).toHaveLength(BOARD_SIZE);
    BOARD.forEach((tile, i) => expect(tile.position).toBe(i));
  });

  it("is frozen — config is not mutable state", () => {
    expect(Object.isFrozen(BOARD)).toBe(true);
  });

  it("has exactly 22 property tiles across 8 groups", () => {
    const properties = BOARD.filter((t) => t.type === "property") as PropertyTile[];
    expect(properties).toHaveLength(22);
    const groups = new Set(properties.map((p) => p.group));
    expect(groups.size).toBe(8);
  });

  it("never places two directly-adjacent tiles in the same property group", () => {
    for (let i = 0; i < BOARD_SIZE; i++) {
      const a = BOARD[i]!;
      const b = BOARD[(i + 1) % BOARD_SIZE]!;
      if (a.type === "property" && b.type === "property") {
        expect(
          a.group,
          `positions ${a.position} and ${b.position} share group ${a.group}`,
        ).not.toBe(b.group);
      }
    }
  });

  it("keeps the group-size distribution at two groups of 2 and six of 3", () => {
    const properties = BOARD.filter((t) => t.type === "property") as PropertyTile[];
    const sizes = new Map<PropertyGroup, number>();
    for (const p of properties) sizes.set(p.group, (sizes.get(p.group) ?? 0) + 1);
    const counts = [...sizes.values()].sort((x, y) => x - y);
    expect(counts).toEqual([2, 2, 3, 3, 3, 3, 3, 3]);
  });

  it("has 4 transit tiles and 2 utility tiles", () => {
    expect(BOARD.filter((t) => t.type === "transit")).toHaveLength(4);
    expect(BOARD.filter((t) => t.type === "utility")).toHaveLength(2);
  });

  it("has exactly one GO, one Jail, one Go-To-Jail, one Free Parking", () => {
    for (const type of ["go", "jail", "go-to-jail", "free-parking"] as const) {
      expect(BOARD.filter((t) => t.type === type)).toHaveLength(1);
    }
  });

  it("rent strictly increases with development for every property", () => {
    const properties = BOARD.filter((t) => t.type === "property") as PropertyTile[];
    for (const p of properties) {
      const { base, oneHouse, twoHouses, threeHouses, fourHouses, hotel } = p.rent;
      expect(oneHouse).toBeGreaterThan(base);
      expect(twoHouses).toBeGreaterThan(oneHouse);
      expect(threeHouses).toBeGreaterThan(twoHouses);
      expect(fourHouses).toBeGreaterThan(threeHouses);
      expect(hotel).toBeGreaterThan(fourHouses);
    }
  });

  it("price strictly increases group-to-group (brown cheapest, dark-blue priciest)", () => {
    const groupOrder: PropertyGroup[] = [
      "brown",
      "light-blue",
      "pink",
      "orange",
      "red",
      "yellow",
      "green",
      "dark-blue",
    ];
    const avgPriceByGroup = groupOrder.map((g) => {
      const props = propertiesInGroup(g);
      return props.reduce((sum, p) => sum + p.price, 0) / props.length;
    });
    for (let i = 1; i < avgPriceByGroup.length; i++) {
      expect(avgPriceByGroup[i]).toBeGreaterThan(avgPriceByGroup[i - 1]!);
    }
  });

  it("mortgage value is exactly half of price, rounded, for every ownable tile", () => {
    for (const tile of BOARD) {
      if (isOwnable(tile)) {
        expect(tile.mortgageValue).toBe(Math.round(tile.price / 2));
      }
    }
  });
});

describe("getTile", () => {
  it("returns the correct tile for in-range positions", () => {
    expect(getTile(0).type).toBe("go");
    expect(getTile(10).type).toBe("jail");
  });

  it("wraps around the board for positions >= 40 (passing GO)", () => {
    expect(getTile(40)).toEqual(getTile(0));
    expect(getTile(43)).toEqual(getTile(3));
  });

  it("wraps correctly for negative positions too", () => {
    expect(getTile(-1)).toEqual(getTile(39));
  });
});
