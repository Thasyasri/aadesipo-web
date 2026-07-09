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
import { GROUP_COLORS } from "@/theme/groupColors";
import { formatRupees } from "@/utils/currency";
import { tileNameWithCode } from "@/utils/tileCode";

interface PropertiesSheetProps {
  game: GameState;
  /** THE LOCAL VIEWER'S seat — whose portfolio this device may see and manage.
   *  Emphatically NOT the acting player. Passing the acting player here meant
   *  that, online, whoever's turn it was had their holdings rendered to EVERY
   *  player, complete with a live "Sell building" button on their houses (the
   *  server rejected the action, but it should never have been offered). The
   *  same flaw exposed the AI's portfolio in a vs-AI game. */
  playerId: string;
  /** Whether this viewer may act right now — it's their turn and this device
   *  controls that seat. Looking at your own properties is always allowed;
   *  building, selling and mortgaging are not. */
  canAct: boolean;
  open: boolean;
  onClose: () => void;
  dispatch: (action: Action) => void;
  /** Open a tile's full detail sheet (rent table etc.) without leaving here. */
  onInspect: (position: number) => void;
}

export function PropertiesSheet({
  game,
  playerId,
  canAct,
  open,
  onClose,
  dispatch,
  onInspect,
}: PropertiesSheetProps) {
  const owned = propertiesOwnedBy(game, playerId);
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
      <LoanSection game={game} playerId={playerId} canAct={canAct} dispatch={dispatch} />
      {owned.length === 0 ? (
        <p className="text-body text-text-secondary">You don't own any properties yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {owned.map((position) => {
            const tile = getTile(position);
            const ownership = ownershipAt(game, position);
            if (tile.type !== "property" && tile.type !== "transit" && tile.type !== "utility") {
              return null;
            }

            const groupColor = tile.type === "property" ? GROUP_COLORS[tile.group] : "#5A6284";
            const houses = ownership?.houses ?? 0;
            const mortgaged = ownership?.isMortgaged ?? false;
            const buildingHotel = houses === 4;
            const outOfStock = supply
              ? buildingHotel
                ? supply.hotels < 1
                : supply.houses < 1
              : false;
            const unevenBuild = !canBuildEvenly(game, playerId, position);
            const canBuild =
              canAct && tile.type === "property" && !mortgaged && !outOfStock && !unevenBuild;
            const hasBuildings = houses > 0 || ownership?.hasHotel;
            const canSell =
              canAct && tile.type === "property" && canSellEvenly(game, playerId, position);
            // Why a build/sell control is unavailable — shown as a caption so a
            // disabled button never reads as a broken control.
            const buildBlockedReason =
              tile.type !== "property" || mortgaged
                ? null
                : outOfStock
                  ? buildingHotel
                    ? "No hotels left in the bank."
                    : "No houses left in the bank."
                  : unevenBuild && !hasBuildings
                    ? "Build evenly across the colour group."
                    : null;

            return (
              <div
                key={position}
                className="flex flex-col gap-2 rounded-md border border-bg-raised bg-bg-surface p-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-8 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: groupColor }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onInspect(position)}
                        className="min-w-0 text-left font-semibold text-text-primary underline decoration-dotted underline-offset-2"
                      >
                        {tileNameWithCode(tile.name)}
                      </button>
                      <StatusBadge
                        houses={houses}
                        hasHotel={!!ownership?.hasHotel}
                        mortgaged={mortgaged}
                      />
                    </div>
                    <span className="text-caption text-text-secondary">
                      {formatRupees(tile.price)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {tile.type === "property" && !mortgaged && (
                    <Button
                      variant="secondary"
                      className="w-full !min-w-0 !px-2 !py-2 !text-body"
                      disabled={!canBuild}
                      onClick={() => dispatch({ type: "BuildHouse", playerId: playerId, position })}
                    >
                      Build {buildingHotel ? "hotel" : "house"} ({formatRupees(tile.buildingCost)})
                    </Button>
                  )}
                  {tile.type === "property" && !mortgaged && hasBuildings && (
                    <Button
                      variant="secondary"
                      className="w-full !min-w-0 !px-2 !py-2 !text-body"
                      disabled={!canSell}
                      onClick={() => dispatch({ type: "SellHouse", playerId: playerId, position })}
                    >
                      Sell building
                    </Button>
                  )}
                  {!mortgaged ? (
                    <Button
                      variant="secondary"
                      className={`w-full !min-w-0 !px-2 !py-2 !text-body ${
                        tile.type !== "property" ? "col-span-2" : ""
                      }`}
                      disabled={!canAct || !!hasBuildings}
                      onClick={() =>
                        dispatch({ type: "MortgageProperty", playerId: playerId, position })
                      }
                    >
                      Mortgage (+{formatRupees(tile.mortgageValue)})
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      className="col-span-2 w-full !min-w-0 !px-2 !py-2 !text-body"
                      disabled={!canAct}
                      onClick={() =>
                        dispatch({
                          type: "UnmortgageProperty",
                          playerId: playerId,
                          position,
                        })
                      }
                    >
                      Unmortgage ({formatRupees(Math.round(tile.mortgageValue * 1.1))})
                    </Button>
                  )}
                  {!mortgaged && !hasBuildings && (
                    <Button
                      variant="tertiary"
                      className="col-span-2 w-full !min-w-0 !px-2 !py-2 !text-body"
                      disabled={!canAct}
                      onClick={() =>
                        dispatch({ type: "SellProperty", playerId: playerId, position })
                      }
                    >
                      Sell to highest bidder (auction)
                    </Button>
                  )}
                </div>
                {(() => {
                  // One prioritised hint, so disabled controls always have a
                  // plain-language reason and never read as broken.
                  const hint = hasBuildings
                    ? !canSell
                      ? "Sell buildings evenly across the colour group first."
                      : "Sell all buildings before you can mortgage."
                    : buildBlockedReason;
                  return hint ? <p className="text-caption text-text-disabled">{hint}</p> : null;
                })()}
              </div>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}

/** Compact building/mortgage status pill shown next to a property's name. */
function StatusBadge({
  houses,
  hasHotel,
  mortgaged,
}: {
  houses: number;
  hasHotel: boolean;
  mortgaged: boolean;
}) {
  if (mortgaged) {
    return (
      <span className="shrink-0 rounded-pill bg-semantic-error/15 px-2 py-0.5 text-micro font-semibold text-semantic-error">
        Mortgaged
      </span>
    );
  }
  if (hasHotel) {
    return (
      <span className="shrink-0 rounded-pill bg-bg-raised px-2 py-0.5 text-micro font-semibold text-text-secondary">
        🏨 Hotel
      </span>
    );
  }
  if (houses > 0) {
    return (
      <span className="shrink-0 rounded-pill bg-bg-raised px-2 py-0.5 text-micro font-semibold text-text-secondary">
        🏠 {houses}
      </span>
    );
  }
  return null;
}

/**
 * Bank-loan controls: a trailing player can borrow against net worth (a
 * catch-up lever), and repay an outstanding loan whose owed balance grows with
 * interest each round. Only rendered when there's a loan or borrowing is
 * available, so it stays out of the way otherwise.
 */
function LoanSection({
  game,
  playerId,
  canAct,
  dispatch,
}: {
  game: GameState;
  playerId: string;
  /** Borrowing/repaying is a turn action — always viewable, only actionable on
   *  your own turn, from the device that controls the seat. */
  canAct: boolean;
  dispatch: (action: Action) => void;
}) {
  const player = game.players.find((p) => p.id === playerId);
  if (!player) return null;

  const loan = player.loan;
  const cap = loanCap(game, playerId);

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
            disabled={!canAct || player.cash <= 0}
            onClick={() =>
              dispatch({
                type: "RepayLoan",
                playerId: playerId,
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
            disabled={!canAct}
            onClick={() => dispatch({ type: "TakeLoan", playerId: playerId, amount: cap })}
          >
            Borrow {formatRupees(cap)}
          </Button>
        </>
      )}
    </div>
  );
}
