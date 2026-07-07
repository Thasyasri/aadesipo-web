import { getTile, type Action, type GameState } from "@aadesipo/engine";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import type { PlayerSetup } from "@/state/gameStore";
import { formatRupees } from "@/utils/currency";
import { tileNameWithCode } from "@/utils/tileCode";

interface AuctionSheetProps {
  game: GameState;
  /** Player setups, so the "current bid by …" line shows a display name, not a raw id. */
  players: readonly PlayerSetup[];
  actingPlayerId: string;
  isActingPlayerLocal: boolean;
  dispatch: (action: Action) => void;
}

const BID_INCREMENT = 10;

export function AuctionSheet({
  game,
  players,
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
  // Honour the reserve (mortgage value) on a sale — the first bid starts there.
  const nextBid = Math.max(auction.minBid, auction.highestBid + BID_INCREMENT);
  const canBid = player.cash >= nextBid;
  const nameFor = (id: string) => players.find((p) => p.id === id)?.displayName ?? id;

  const pass = () => dispatch({ type: "PassAuction", playerId: actingPlayerId });

  return (
    <BottomSheet
      open
      onClose={pass}
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={pass}>
            Pass
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={!canBid}
            onClick={() =>
              dispatch({ type: "PlaceBid", playerId: actingPlayerId, amount: nextBid })
            }
          >
            Bid {formatRupees(nextBid)}
          </Button>
        </div>
      }
    >
      <h2 className="mb-1 font-display text-title">Auction: {tileNameWithCode(tile.name)}</h2>
      {auction.sellerId && (
        <p className="mb-1 text-caption text-text-secondary">
          Put up for sale by {nameFor(auction.sellerId)} — the winning bid goes to them.
        </p>
      )}
      <p className="text-body text-text-secondary">
        {auction.highestBid > 0 ? (
          <>
            Current bid {formatRupees(auction.highestBid)}
            {auction.highestBidderId && ` by ${nameFor(auction.highestBidderId)}`}
          </>
        ) : auction.minBid > 0 ? (
          `No bids yet · reserve ${formatRupees(auction.minBid)}`
        ) : (
          "No bids yet"
        )}
      </p>
      {!canBid && (
        <p className="mt-2 text-caption text-semantic-warn">
          Not enough cash to raise — you can only pass.
        </p>
      )}
    </BottomSheet>
  );
}
