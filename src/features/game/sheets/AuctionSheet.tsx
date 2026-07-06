import { getTile, type Action, type GameState } from "@aadesipo/engine";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { formatRupees } from "@/utils/currency";

interface AuctionSheetProps {
  game: GameState;
  actingPlayerId: string;
  isActingPlayerLocal: boolean;
  dispatch: (action: Action) => void;
}

const BID_INCREMENT = 10;

export function AuctionSheet({
  game,
  actingPlayerId,
  isActingPlayerLocal,
  dispatch,
}: AuctionSheetProps) {
  const auction = game.pendingAuction;

  const isTurnToBid =
    isActingPlayerLocal &&
    game.turnPhase === "awaiting-auction" &&
    auction?.turnBidderId === actingPlayerId;
  if (!isTurnToBid || !auction) return null;

  const tile = getTile(auction.position);
  const player = game.players.find((p) => p.id === actingPlayerId)!;
  const nextBid = auction.highestBid + BID_INCREMENT;
  const canBid = player.cash >= nextBid;

  return (
    <BottomSheet open onClose={() => dispatch({ type: "PassAuction", playerId: actingPlayerId })}>
      <h2 className="mb-1 font-display text-title">Auction: {tile.name}</h2>
      <p className="mb-4 text-body text-text-secondary">
        {auction.highestBid > 0 ? (
          <>
            Current bid {formatRupees(auction.highestBid)}
            {auction.highestBidderId && ` by ${auction.highestBidderId}`}
          </>
        ) : (
          "No bids yet"
        )}
      </p>
      <div className="flex gap-3">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => dispatch({ type: "PassAuction", playerId: actingPlayerId })}
        >
          Pass
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={!canBid}
          onClick={() => dispatch({ type: "PlaceBid", playerId: actingPlayerId, amount: nextBid })}
        >
          Bid {formatRupees(nextBid)}
        </Button>
      </div>
    </BottomSheet>
  );
}
