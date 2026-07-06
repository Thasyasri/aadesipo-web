import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { useSession } from "@/state/session";
import {
  fetchRoomInfo,
  fetchRoomSeats,
  fetchProfiles,
  subscribeToRoomPlayers,
  startGame,
  type RoomInfo,
} from "@/multiplayer/onlineClient";
import { useOnlineGameView } from "@/multiplayer/onlineGameStore";

interface Seat {
  userId: string;
  seatIndex: number;
  displayName: string;
}

export function LobbyScreen() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useSession();
  const { showToast } = useToast();
  const connect = useOnlineGameView((s) => s.connect);

  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [starting, setStarting] = useState(false);

  const refresh = useCallback(async () => {
    if (!roomId) return;
    try {
      const [roomInfo, rawSeats] = await Promise.all([
        fetchRoomInfo(roomId),
        fetchRoomSeats(roomId),
      ]);
      const profiles = await fetchProfiles(rawSeats.map((s) => s.userId));
      setRoom(roomInfo);
      setSeats(
        rawSeats.map((s) => ({
          ...s,
          displayName: profiles[s.userId]?.displayName ?? "Player",
        })),
      );

      if (roomInfo.status === "in_progress") {
        navigate(`/online/${roomId}`, { replace: true });
      }
    } catch (err) {
      showToast((err as Error).message, "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    void refresh();
    if (!roomId) return;
    const unsub = subscribeToRoomPlayers(roomId, refresh);
    // Fallback poll: realtime is the fast path, but a missed/dropped event
    // shouldn't strand the lobby out of sync (wrong seat count, or a non-host
    // never learning the game started).
    const poll = window.setInterval(() => void refresh(), 3000);
    return () => {
      unsub();
      window.clearInterval(poll);
    };
  }, [roomId, refresh]);

  if (!roomId || !room) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Card>
          <p className="text-body text-text-secondary">Loading room…</p>
        </Card>
      </div>
    );
  }

  const isHost = user?.id === room.hostId;
  const inviteUrl = `${window.location.origin}/join/${room.roomCode}`;

  const handleStart = async () => {
    setStarting(true);
    try {
      const { gameId, seed } = await startGame(room.id);
      const playerIds = seats.map((s) => s.userId);
      await connect(room.id, gameId, seed, playerIds, user!.id, room.mode, room.houseRules);
      navigate(`/online/${room.id}`);
    } catch (err) {
      showToast((err as Error).message, "error");
      setStarting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <Card>
        <p className="mb-1 text-caption text-text-secondary">Room code</p>
        <p className="mb-4 font-display text-display tracking-widest text-brand-primary-strong">
          {room.roomCode}
        </p>
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => {
            void navigator.clipboard.writeText(inviteUrl);
            showToast("Invite link copied", "success");
          }}
        >
          Copy invite link
        </Button>
      </Card>

      <Card>
        <p className="mb-3 text-caption font-semibold text-text-secondary">
          Players ({seats.length}/{room.maxPlayers})
        </p>
        <div className="flex flex-col gap-2">
          {seats.map((seat) => (
            <div
              key={seat.seatIndex}
              className="flex items-center justify-between rounded-md bg-bg-raised px-3 py-2"
            >
              <span className="text-body text-text-primary">{seat.displayName}</span>
              {seat.userId === room.hostId && (
                <span className="text-caption text-text-secondary">Host</span>
              )}
            </div>
          ))}
          {Array.from({ length: room.maxPlayers - seats.length }, (_, i) => (
            <div
              key={`empty-${i}`}
              className="rounded-md border border-dashed border-bg-raised px-3 py-2 text-caption text-text-disabled"
            >
              Waiting for a player…
            </div>
          ))}
        </div>
      </Card>

      {isHost ? (
        <Button
          variant="primary"
          disabled={seats.length < 2 || starting}
          onClick={() => void handleStart()}
        >
          {starting ? "Starting…" : "Start game"}
        </Button>
      ) : (
        <p className="text-center text-body text-text-secondary">
          Waiting for the host to start the game…
        </p>
      )}
    </div>
  );
}
