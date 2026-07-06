import { CHANCE_TABLE, FUNNY_TABLE, type EventEffect, type EventOutcome } from "@aadesipo/engine";
import { BottomSheet } from "@/components/BottomSheet";
import { formatRupees } from "@/utils/currency";

interface EventTablesSheetProps {
  open: boolean;
  onClose: () => void;
}

const DICE_SUMS = Array.from({ length: 11 }, (_, i) => i + 2); // 2 through 12

/** The rupee amount an outcome moves, labeled for direction and per-player
 *  effects. Pure movement outcomes (jail, jail-free card) have no amount. */
function effectAmountLabel(effect: EventEffect): string | null {
  switch (effect.kind) {
    case "pay-bank":
      return `Pay ${formatRupees(effect.amount)}`;
    case "collect-from-bank":
      return `Collect ${formatRupees(effect.amount)}`;
    case "collect-from-each-player":
      return `Collect ${formatRupees(effect.amount)} from each player`;
    case "pay-each-player":
      return `Pay ${formatRupees(effect.amount)} to each player`;
    case "street-repairs":
      return `Pay ${formatRupees(effect.perHouse)}/house · ${formatRupees(effect.perHotel)}/hotel`;
    case "collect-per-property":
      return `Collect ${formatRupees(effect.amount)} per property from each player`;
    case "advance-to-nearest-transit":
    case "advance-to-tile":
    case "move-back-n-spaces":
    case "go-to-jail":
    case "grant-jail-free-card":
      return null;
  }
}

/**
 * Tapping the board's center emblem opens this: the full, deterministic
 * dice-sum → outcome tables for both event tile types, straight from
 * CHANCE_TABLE / FUNNY_TABLE, including the exact rupee amount involved.
 */
export function EventTablesSheet({ open, onClose }: EventTablesSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <h2 className="mb-1 font-display text-title">Event outcomes</h2>
      <p className="mb-4 text-caption text-text-secondary">
        Landing on an event tile is decided by your exact dice sum — no random draw.
      </p>
      <div className="flex flex-col gap-6">
        <EventSection title="Chance" table={CHANCE_TABLE} />
        <EventSection title="Sarpanch Gari Dabba" table={FUNNY_TABLE} />
      </div>
    </BottomSheet>
  );
}

function EventSection({
  title,
  table,
}: {
  title: string;
  table: Readonly<Record<number, EventOutcome>>;
}) {
  return (
    <section>
      <h3 className="mb-2 text-body-lg font-semibold text-brand-primary">{title}</h3>
      <ul className="flex flex-col gap-2">
        {DICE_SUMS.map((sum) => {
          const outcome = table[sum];
          const amount = outcome ? effectAmountLabel(outcome.effect) : null;
          return (
            <li key={sum} className="flex gap-2 text-body">
              <span className="w-16 shrink-0 font-semibold tabular-nums text-text-secondary">
                Roll a {sum}
              </span>
              <span className="text-text-primary">
                {outcome?.text}
                {amount && <span className="font-semibold text-brand-primary"> ({amount})</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
