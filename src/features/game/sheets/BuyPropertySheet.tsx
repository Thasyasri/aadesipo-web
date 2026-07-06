import {
  getActingPlayerId,
  getTile,
  isOwnable,
  type Action,
  type GameState,
} from "@aadesipo/engine";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { PropertyCard } from "../PropertyCard";
import { formatRupees } from "@/utils/currency";

interface BuyPropertySheetProps {
  game: GameState;
  actingPlayerId: string;
  isActingPlayerLocal: boolean;
  dispatch: (action: Action) => void;
}

export function BuyPropertySheet({
  game,
  actingPlayerId,
  isActingPlayerLocal,
  dispatch,
}: BuyPropertySheetProps) {
  const isDecisionPending =
    isActingPlayerLocal &&
    game.turnPhase === "awaiting-tile-decision" &&
    getActingPlayerId(game) === actingPlayerId;
  if (!isDecisionPending) return null;

  const player = game.players.find((p) => p.id === actingPlayerId);
  if (!player) return null;
  const tile = getTile(player.position);
  if (!isOwnable(tile)) return null;

  const canAfford = player.cash >= tile.price;
  const decline = () =>
    dispatch({ type: "DeclineProperty", playerId: actingPlayerId, position: tile.position });

  return (
    <BottomSheet open onClose={decline}>
      <div className="mb-4 flex justify-center">
        <PropertyCard tile={tile} width={140} />
      </div>
      <p className="mb-1 text-center text-caption text-text-secondary">
        Tap the card to see the rent table
      </p>
      {!canAfford && (
        <p className="mb-4 text-center text-caption text-semantic-warn">
          Not enough cash — declining will send this to auction.
        </p>
      )}
      <div className="mt-4 flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={decline}>
          Decline
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={!canAfford}
          onClick={() =>
            dispatch({ type: "BuyProperty", playerId: actingPlayerId, position: tile.position })
          }
        >
          Buy for {formatRupees(tile.price)}
        </Button>
      </div>
    </BottomSheet>
  );
}
