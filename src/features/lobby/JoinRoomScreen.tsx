import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { joinRoom } from "@/multiplayer/onlineClient";
import { useSession } from "@/state/session";

export function JoinRoomScreen() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  // Wait for the (guest) session before joining — otherwise the invoke fires
  // without a user JWT and the function rejects it as unauthenticated.
  const user = useSession((s) => s.user);
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (!roomCode || !user || attempted.current) return;
    attempted.current = true;
    joinRoom(roomCode)
      .then(({ roomId }) => navigate(`/room/${roomId}`, { replace: true }))
      .catch((err: Error) => setError(err.message));
  }, [roomCode, user, navigate]);

  return (
    <div className="mx-auto max-w-md p-6">
      <Card>
        {error ? (
          <>
            <p className="mb-4 text-body text-semantic-error">{error}</p>
            <Button variant="primary" onClick={() => navigate("/play")}>
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
