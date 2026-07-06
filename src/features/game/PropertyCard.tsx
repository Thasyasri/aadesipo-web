import { motion } from "motion/react";
import { useState } from "react";
import type { PropertyOwnership, Tile } from "@aadesipo/engine";
import { isOwnable } from "@aadesipo/engine";
import { GROUP_COLORS } from "@/theme/groupColors";
import { springs, useMotionPrefs } from "@/theme/motion";
import { formatRupees } from "@/utils/currency";

interface PropertyCardProps {
  tile: Tile;
  ownership?: PropertyOwnership;
  width?: number;
}

export function PropertyCard({ tile, ownership, width = 160 }: PropertyCardProps) {
  const [flipped, setFlipped] = useState(false);
  const { reduceMotion } = useMotionPrefs();
  const height = width * 1.4;

  if (!isOwnable(tile)) return null;
  const groupColor = tile.type === "property" ? GROUP_COLORS[tile.group] : "#5A6284";

  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      className="relative cursor-pointer"
      style={{ width, height, perspective: 800 }}
      aria-label={`${tile.name} property card, tap to ${flipped ? "see front" : "see rent"}`}
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={reduceMotion ? { duration: 0 } : springs.snappy}
      >
        <div
          className="absolute inset-0 flex flex-col overflow-hidden rounded-md bg-bg-surface shadow-[var(--shadow-e1)]"
          style={{ backfaceVisibility: "hidden" }}
        >
          <div className="h-8 w-full" style={{ backgroundColor: groupColor }} />
          <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-2 p-3">
            <span className="text-center text-caption font-semibold text-text-primary">
              {tile.name}
            </span>
            <span className="text-micro text-text-secondary">{formatRupees(tile.price)}</span>
          </div>
          {ownership?.isMortgaged && (
            <div className="absolute right-0 top-0 rounded-bl-md bg-semantic-error px-2 py-0.5 text-micro font-semibold text-[#1A1200]">
              Mortgaged
            </div>
          )}
        </div>

        <div
          className="absolute inset-0 flex flex-col rounded-md bg-bg-surface p-3 shadow-[var(--shadow-e1)]"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <span className="mb-2 text-center text-caption font-semibold text-text-primary">
            {tile.name}
          </span>
          <RentTable tile={tile} ownership={ownership} />
        </div>
      </motion.div>
    </button>
  );
}

function RentTable({ tile, ownership }: { tile: Tile; ownership?: PropertyOwnership }) {
  if (tile.type === "property") {
    const rows: Array<[string, number, boolean]> = [
      ["Base rent", tile.rent.base, !ownership?.hasHotel && (ownership?.houses ?? 0) === 0],
      ["1 house", tile.rent.oneHouse, ownership?.houses === 1],
      ["2 houses", tile.rent.twoHouses, ownership?.houses === 2],
      ["3 houses", tile.rent.threeHouses, ownership?.houses === 3],
      ["4 houses", tile.rent.fourHouses, ownership?.houses === 4],
      ["Hotel", tile.rent.hotel, ownership?.hasHotel === true],
    ];
    return (
      <div className="flex flex-1 flex-col justify-center gap-1">
        {rows.map(([label, amount, current]) => (
          <div
            key={label}
            className={`flex justify-between text-micro ${
              current ? "font-bold text-brand-primary" : "text-text-secondary"
            }`}
          >
            <span>{label}</span>
            <span className="tabular-nums">{formatRupees(amount)}</span>
          </div>
        ))}
      </div>
    );
  }

  if (tile.type === "transit") {
    return (
      <div className="flex flex-1 flex-col justify-center gap-1">
        {tile.rentBySetSize.map((amount, i) => (
          <div key={i} className="flex justify-between text-micro text-text-secondary">
            <span>{i + 1} owned</span>
            <span className="tabular-nums">{formatRupees(amount)}</span>
          </div>
        ))}
      </div>
    );
  }

  if (tile.type === "utility") {
    return (
      <div className="flex flex-1 flex-col justify-center gap-1">
        {tile.diceMultiplierBySetSize.map((mult, i) => (
          <div key={i} className="flex justify-between text-micro text-text-secondary">
            <span>{i + 1} owned</span>
            <span className="tabular-nums">dice × {mult}</span>
          </div>
        ))}
      </div>
    );
  }

  return null;
}
