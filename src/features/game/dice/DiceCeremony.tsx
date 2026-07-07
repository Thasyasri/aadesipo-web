import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { GameEvent } from "@aadesipo/engine";
import { DieFace } from "./DieFace";
import { useMotionPrefs } from "@/theme/motion";

const TUMBLE_MS = 700;
// How long the settled result stays up before the overlay clears for the
// token's walk. The persistent last-roll badge on the panel keeps the numbers
// visible after this, so it stays short enough not to sit over the walk.
const HOLD_MS = 600;
const TUMBLE_INTERVAL_MS = 80;
const SKIPPABLE_AFTER_MS = 300;

interface CeremonyState {
  die1: number;
  die2: number;
  tumbling: boolean;
}

interface DiceCeremonyProps {
  events: readonly GameEvent[];
}

export function DiceCeremony({ events }: DiceCeremonyProps) {
  const { reduceMotion } = useMotionPrefs();
  const [ceremony, setCeremony] = useState<CeremonyState | null>(null);
  const [canSkip, setCanSkip] = useState(false);
  const seenCount = useRef(0);

  useEffect(() => {
    const newOnes = events.slice(seenCount.current);
    seenCount.current = events.length;
    const rollEvent = newOnes.find((e) => e.type === "DiceRolled");
    if (!rollEvent || rollEvent.type !== "DiceRolled") return;

    if (reduceMotion) {
      setCeremony({ die1: rollEvent.die1, die2: rollEvent.die2, tumbling: false });
      setCanSkip(true);
      const t = setTimeout(() => setCeremony(null), 500);
      return () => clearTimeout(t);
    }

    setCeremony({ die1: 1, die2: 1, tumbling: true });
    setCanSkip(false);

    const tumbleInterval = setInterval(() => {
      setCeremony((c) =>
        c
          ? {
              ...c,
              die1: 1 + Math.floor(Math.random() * 6),
              die2: 1 + Math.floor(Math.random() * 6),
            }
          : c,
      );
    }, TUMBLE_INTERVAL_MS);

    const settleTimer = setTimeout(() => {
      clearInterval(tumbleInterval);
      setCeremony({ die1: rollEvent.die1, die2: rollEvent.die2, tumbling: false });
    }, TUMBLE_MS);

    const skipUnlockTimer = setTimeout(() => setCanSkip(true), SKIPPABLE_AFTER_MS);
    const dismissTimer = setTimeout(() => setCeremony(null), TUMBLE_MS + HOLD_MS);

    return () => {
      clearInterval(tumbleInterval);
      clearTimeout(settleTimer);
      clearTimeout(skipUnlockTimer);
      clearTimeout(dismissTimer);
    };
  }, [events, reduceMotion]);

  return (
    <AnimatePresence>
      {ceremony && (
        <motion.div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => canSkip && setCeremony(null)}
        >
          <motion.div
            className="flex gap-4"
            animate={
              ceremony.tumbling ? { rotate: [0, -8, 8, -4, 0] } : { rotate: 0, scale: [1.15, 1] }
            }
            transition={{ duration: 0.15, repeat: ceremony.tumbling ? Infinity : 0 }}
          >
            <DieFace value={ceremony.die1} />
            <DieFace value={ceremony.die2} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
