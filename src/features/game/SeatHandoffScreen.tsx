import { motion } from "motion/react";
import { Button } from "@/components/Button";
import { springs } from "@/theme/motion";

interface SeatHandoffScreenProps {
  nextPlayerName: string;
  onReady: () => void;
}

export function SeatHandoffScreen({ nextPlayerName, onReady }: SeatHandoffScreenProps) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-bg-base p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={springs.snappy}
    >
      <span className="text-6xl" aria-hidden="true">
        📱
      </span>
      <h2 className="text-center font-display text-title text-text-primary">Pass the device to</h2>
      <p className="text-center font-display text-display text-brand-primary-strong">
        {nextPlayerName}
      </p>
      <p className="max-w-xs text-center text-body text-text-secondary">
        Everyone else, look away — no peeking at their board.
      </p>
      <Button variant="primary" className="mt-2 px-10" onClick={onReady}>
        I'm ready
      </Button>
    </motion.div>
  );
}
