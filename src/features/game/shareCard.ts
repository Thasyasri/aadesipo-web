import type { GameState } from "@aadesipo/engine";
import { netWorth } from "@aadesipo/engine";
import type { PlayerSetup } from "@/state/gameStore";
import { PLAYER_COLORS } from "@/theme/tokens";
import { formatRupees } from "@/utils/currency";

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1080;

export function generateShareCard(game: GameState, players: readonly PlayerSetup[]): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const gradient = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
  gradient.addColorStop(0, "#0F1222");
  gradient.addColorStop(1, "#1A1F35");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.fillStyle = "#FFB020";
  ctx.font = "800 56px 'Fraunces', Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("AadesiPo", CARD_WIDTH / 2, 140);

  const winnerSetup = players.find((p) => p.id === game.winnerId);
  ctx.fillStyle = "#F4F5FA";
  ctx.font = "800 72px 'Fraunces', Georgia, serif";
  ctx.fillText(`${winnerSetup?.displayName ?? game.winnerId ?? "?"} wins! 🎉`, CARD_WIDTH / 2, 300);

  ctx.fillStyle = "#A3ABC7";
  ctx.font = "400 32px Manrope, system-ui, sans-serif";
  const reasonText =
    game.players.filter((p) => !p.isBankrupt).length === 1
      ? "Last player standing"
      : "Highest net worth when time ran out";
  ctx.fillText(reasonText, CARD_WIDTH / 2, 350);

  const ranked = [...game.players].sort((a, b) => netWorth(game, b.id) - netWorth(game, a.id));
  let y = 480;
  ranked.forEach((p, i) => {
    const setup = players.find((ps) => ps.id === p.id);
    const idx = game.players.findIndex((gp) => gp.id === p.id);

    ctx.fillStyle = PLAYER_COLORS[idx % PLAYER_COLORS.length]!;
    ctx.beginPath();
    ctx.arc(260, y - 12, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#F4F5FA";
    ctx.font = "600 36px Manrope, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`#${i + 1}  ${setup?.displayName ?? p.id}`, 300, y);

    ctx.textAlign = "right";
    ctx.fillStyle = "#A3ABC7";
    ctx.fillText(formatRupees(netWorth(game, p.id)), CARD_WIDTH - 260, y);

    ctx.textAlign = "center";
    y += 80;
  });

  ctx.fillStyle = "#5A6284";
  ctx.font = "400 24px Manrope, system-ui, sans-serif";
  ctx.fillText(
    "A desi-flavored game of fortunes and funny events",
    CARD_WIDTH / 2,
    CARD_HEIGHT - 60,
  );

  return canvas.toDataURL("image/png");
}

export function downloadShareCard(dataUrl: string, filename = "aadesipo-victory.png"): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}
