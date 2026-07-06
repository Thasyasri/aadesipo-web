import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { joinRoom } from "@/multiplayer/onlineClient";

export function JoinRoomScreen() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (!roomCode || attempted.current) return;
    attempted.current = true;
    joinRoom(roomCode)
      .then(({ roomId }) => navigate(`/room/${roomId}`, { replace: true }))
      .catch((err: Error) => setError(err.message));
  }, [roomCode, navigate]);

  return (
    <div className="mx-auto max-w-md p-6">
      <Card>
        {error ? (
          <>
            <p className="mb-4 text-body text-semantic-error">{error}</p>
            <Button variant="primary" onClick={() => navigate("/")}>
              Back to home
            </Button>
          </>
        ) : (
          <p className="text-body text-text-secondary">Joining room {roomCode}…</p>
        )}
      </Card>
    </div>
  );
}
