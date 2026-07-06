import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { listResumableGames, deleteGame, type SavedGameMeta } from "@/services/db";
import { useGameView } from "@/state/gameStore";

export function ResumeGamesList() {
  const [games, setGames] = useState<SavedGameMeta[]>([]);
  const navigate = useNavigate();
  const resumeGame = useGameView((s) => s.resumeGame);

  useEffect(() => {
    void listResumableGames().then(setGames);
  }, []);

  if (games.length === 0) return null;

  const handleResume = (gameId: string) => {
    void resumeGame(gameId).then((ok) => {
      if (ok) navigate(`/game/${gameId}`);
    });
  };

  const handleDismiss = async (gameId: string) => {
    await deleteGame(gameId);
    setGames((prev) => prev.filter((g) => g.gameId !== gameId));
  };

  return (
    <Card>
      <h2 className="mb-3 font-display text-heading">Resume a game</h2>
      <div className="flex flex-col gap-2">
        {games.map((g) => (
          <div
            key={g.gameId}
            className="flex items-center justify-between gap-3 rounded-md bg-bg-raised px-3 py-2"
          >
            <div>
              <p className="text-body text-text-primary">
                {g.players.map((p) => p.displayName).join(", ")}
              </p>
              <p className="text-caption text-text-secondary">
                {g.isPassAndPlay ? "Pass & Play" : "Vs. AI"} · updated{" "}
                {new Date(g.updatedAt).toLocaleString()}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="tertiary" onClick={() => void handleDismiss(g.gameId)}>
                Dismiss
              </Button>
              <Button variant="primary" onClick={() => handleResume(g.gameId)}>
                Resume
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
