import {
  getTile,
  loanCap,
  canBuildEvenly,
  canSellEvenly,
  ownershipAt,
  propertiesOwnedBy,
  type Action,
  type GameState,
} from "@aadesipo/engine";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { PropertyCard } from "../PropertyCard";
import { formatRupees } from "@/utils/currency";

interface PropertiesSheetProps {
  game: GameState;
  actingPlayerId: string;
  open: boolean;
  onClose: () => void;
  dispatch: (action: Action) => void;
}

export function PropertiesSheet({
  game,
  actingPlayerId,
  open,
  onClose,
  dispatch,
}: PropertiesSheetProps) {
  const owned = propertiesOwnedBy(game, actingPlayerId);
  const supply = game.buildingSupply;

  return (
    <BottomSheet open={open} onClose={onClose}>
      <h2 className="mb-1 font-display text-title">Your properties</h2>
      {supply && (
        <p className="mb-4 text-caption text-text-secondary">
          Bank stock: {supply.houses} {supply.houses === 1 ? "house" : "houses"} · {supply.hotels}{" "}
          {supply.hotels === 1 ? "hotel" : "hotels"} left
        </p>
      )}
      <LoanSection game={game} actingPlayerId={actingPlayerId} dispatch={dispatch} />
      {owned.length === 0 ? (
        <p className="text-body text-text-secondary">You don't own any properties yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {owned.map((position) => {
            const tile = getTile(position);
            const ownership = ownershipAt(game, position);
            if (tile.type !== "property" && tile.type !== "transit" && tile.type !== "utility") {
              return null;
            }

            return (
              <div key={position} className="flex items-center gap-4">
                <PropertyCard tile={tile} ownership={ownership} width={100} />
                <div className="flex flex-1 flex-col gap-2">
                  {tile.type === "property" && !ownership?.isMortgaged && (
                    <>
                      {(() => {
                        const buildingHotel = (ownership?.houses ?? 0) === 4;
                        const outOfStock = supply
                          ? buildingHotel
                            ? supply.hotels < 1
                            : supply.houses < 1
                          : false;
                        const unevenBuild = !canBuildEvenly(game, actingPlayerId, position);
                        return (
                          <Button
                            variant="secondary"
                            disabled={outOfStock || unevenBuild}
                            onClick={() =>
                              dispatch({ type: "BuildHouse", playerId: actingPlayerId, position })
                            }
                          >
                            {outOfStock
                              ? buildingHotel
                                ? "No hotels left in the bank"
                                : "No houses left in the bank"
                              : unevenBuild
                                ? "Build evenly across the group first"
                                : `Build ${buildingHotel ? "hotel" : "house"} (${formatRupees(tile.buildingCost)})`}
                          </Button>
                        );
                      })()}
                      {((ownership?.houses ?? 0) > 0 || ownership?.hasHotel) && (
                        <Button
                          variant="tertiary"
                          disabled={!canSellEvenly(game, actingPlayerId, position)}
                          onClick={() =>
                            dispatch({ type: "SellHouse", playerId: actingPlayerId, position })
                          }
                        >
                          {canSellEvenly(game, actingPlayerId, position)
                            ? "Sell a building"
                            : "Sell evenly first"}
                        </Button>
                      )}
                    </>
                  )}
                  {!ownership?.isMortgaged ? (
                    <Button
                      variant="tertiary"
                      onClick={() =>
                        dispatch({ type: "MortgageProperty", playerId: actingPlayerId, position })
                      }
                    >
                      Mortgage (+{formatRupees(tile.mortgageValue)})
                    </Button>
                  ) : (
                    <Button
                      variant="tertiary"
                      onClick={() =>
                        dispatch({
                          type: "UnmortgageProperty",
                          playerId: actingPlayerId,
                          position,
                        })
                      }
                    >
                      Pay off mortgage ({formatRupees(Math.round(tile.mortgageValue * 1.1))})
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}

/**
 * Bank-loan controls: a trailing player can borrow against net worth (a
 * catch-up lever), and repay an outstanding loan whose owed balance grows with
 * interest each round. Only rendered when there's a loan or borrowing is
 * available, so it stays out of the way otherwise.
 */
function LoanSection({
  game,
  actingPlayerId,
  dispatch,
}: {
  game: GameState;
  actingPlayerId: string;
  dispatch: (action: Action) => void;
}) {
  const player = game.players.find((p) => p.id === actingPlayerId);
  if (!player) return null;

  const loan = player.loan;
  const cap = loanCap(game, actingPlayerId);

  if (!loan && cap <= 0) return null;

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-md border border-bg-raised bg-bg-surface p-3">
      <h3 className="text-caption font-semibold uppercase tracking-wide text-text-secondary">
        Bank loan
      </h3>
      {loan ? (
        <>
          <p className="text-body text-text-primary">
            You owe {formatRupees(loan.owed)}{" "}
            <span className="text-caption text-text-secondary">
              (borrowed {formatRupees(loan.principal)} · interest accrues each round)
            </span>
          </p>
          <Button
            variant="secondary"
            disabled={player.cash <= 0}
            onClick={() =>
              dispatch({
                type: "RepayLoan",
                playerId: actingPlayerId,
                amount: Math.min(player.cash, loan.owed),
              })
            }
          >
            Repay {formatRupees(Math.min(player.cash, loan.owed))}
          </Button>
        </>
      ) : (
        <>
          <p className="text-caption text-text-secondary">
            You're trailing — borrow against your net worth to catch up (repaid with interest).
          </p>
          <Button
            variant="secondary"
            onClick={() => dispatch({ type: "TakeLoan", playerId: actingPlayerId, amount: cap })}
          >
            Borrow {formatRupees(cap)}
          </Button>
        </>
      )}
    </div>
  );
}
