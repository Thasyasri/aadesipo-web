import { JAIL_BAIL_COST, type Action, type GameState } from "@aadesipo/engine";
import { Button } from "@/components/Button";
import { useTranslation } from "@/i18n";
import { formatRupees } from "@/utils/currency";

interface ActionDockProps {
  game: GameState;
  actingPlayerId: string;
  isActingPlayerLocal: boolean;
  /** True while a pawn is still walking the board. Turn-advancing actions are
   *  held until it lands, so a move can never be interrupted mid-animation. */
  busy?: boolean;
  onOpenProperties: () => void;
  /** Opens the activity/history sheet (kept off-screen behind a button). */
  onOpenActivity: () => void;
  /** Opens the trade sheet. Wired in both offline and online screens; only
   *  omitted when there is no local human who could propose a trade. */
  onOpenTrade?: () => void;
  /** A pending trade is waiting on the local human's response. */
  tradeBadge?: boolean;
  /** Set when the local acting player owes more than their cash and must
   *  raise funds (mortgage/sell) or go bankrupt. */
  debtPrompt?: {
    amount: number;
    creditorName: string;
    canSettle: boolean;
    onSettle: () => void;
    onDeclareBankruptcy: () => void;
  } | null;
  /** Pass-and-play one-step take-back — reverts the last (non-roll) action. */
  canUndo?: boolean;
  onUndo?: () => void;
  dispatch: (action: Action) => void;
}

export function ActionDock({
  game,
  actingPlayerId,
  isActingPlayerLocal,
  busy = false,
  onOpenProperties,
  onOpenActivity,
  onOpenTrade,
  tradeBadge,
  debtPrompt,
  canUndo,
  onUndo,
  dispatch,
}: ActionDockProps) {
  const { t } = useTranslation();

  if (game.turnPhase === "game-over") return null;

  // Owing more than cash forces a raise-funds-or-fold choice before anything
  // else can happen.
  if (debtPrompt) {
    return (
      <div className="flex flex-col gap-3 border-t border-bg-raised p-4">
        <p className="text-center text-body text-semantic-warn">
          You owe {formatRupees(debtPrompt.amount)} to {debtPrompt.creditorName}. Raise funds to
          pay, or go bankrupt.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button variant="secondary" onClick={onOpenProperties}>
            Raise funds
          </Button>
          <Button variant="primary" disabled={!debtPrompt.canSettle} onClick={debtPrompt.onSettle}>
            Pay {formatRupees(debtPrompt.amount)}
          </Button>
          <Button variant="tertiary" onClick={debtPrompt.onDeclareBankruptcy}>
            Declare bankruptcy
          </Button>
        </div>
      </div>
    );
  }

  const player = game.players.find((p) => p.id === actingPlayerId);

  // The Trade button is always available to the local human (it isn't gated by
  // turn phase — the engine allows proposing/answering trades any time). Absent
  // only when no local human could propose one.
  const tradeButton = onOpenTrade ? (
    <div className="relative">
      <Button variant="tertiary" onClick={onOpenTrade}>
        {t("hud.trade")}
      </Button>
      {tradeBadge && (
        <span
          className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-semantic-error ring-2 ring-bg-base"
          aria-hidden="true"
        />
      )}
    </div>
  ) : null;

  if (!isActingPlayerLocal || !player) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-3 border-t border-bg-raised p-4">
        <span className="text-body text-text-secondary">{t("hud.waitingForOthers")}</span>
        <Button variant="tertiary" onClick={onOpenProperties}>
          {t("hud.myProperties")}
        </Button>
        {tradeButton}
        <Button variant="tertiary" onClick={onOpenActivity}>
          {t("hud.activity")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 border-t border-bg-raised p-4">
      <Button variant="tertiary" onClick={onOpenProperties}>
        {t("hud.myProperties")}
      </Button>
      {tradeButton}
      <Button variant="tertiary" onClick={onOpenActivity}>
        {t("hud.activity")}
      </Button>
      {canUndo && onUndo && (
        <Button variant="tertiary" onClick={onUndo}>
          ↩ {t("hud.undo")}
        </Button>
      )}

      {game.turnPhase === "awaiting-roll" && player.inJail && (
        <>
          {/* Doubles gets you out at once but bail is still owed, so say so up
              front rather than surprising the player after the roll. */}
          <p className="basis-full text-center text-caption text-text-secondary">
            {t("hud.jailBailNotice", { amount: formatRupees(JAIL_BAIL_COST) })}
          </p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => dispatch({ type: "PayBail", playerId: actingPlayerId })}
          >
            {t("hud.payBail", { amount: formatRupees(JAIL_BAIL_COST) })}
          </Button>
          {player.jailFreeCards > 0 && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => dispatch({ type: "UseJailFreeCard", playerId: actingPlayerId })}
            >
              {t("hud.useJailFreeCard")}
            </Button>
          )}
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => dispatch({ type: "RollDice", playerId: actingPlayerId })}
          >
            {t("hud.tryDoubles")}
          </Button>
        </>
      )}

      {game.turnPhase === "awaiting-roll" && !player.inJail && (
        <Button
          variant="primary"
          className="px-10"
          disabled={busy}
          onClick={() => dispatch({ type: "RollDice", playerId: actingPlayerId })}
        >
          🎲 {t("hud.roll")}
        </Button>
      )}

      {game.turnPhase === "turn-idle" && (
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => dispatch({ type: "EndTurn", playerId: actingPlayerId })}
        >
          {t("hud.endTurn")}
        </Button>
      )}
    </div>
  );
}
