import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { useEffect, useRef, type ReactNode } from "react";
import { springs } from "@/theme/motion";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * The primary container for in-game decisions (buy? auction? trade?).
 * Never taller than 60% of the viewport so the board stays visible
 * behind it — per the design spec.
 */
export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          // Only a light dim, and lighter still on desktop, so the board stays
          // clearly visible behind/beside the sheet while you decide.
          className="fixed inset-0 z-40 bg-black/25 lg:bg-black/10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            // Phones: a bottom sheet (board sits above it). Desktop: a card in
            // the right-hand column, so the whole board stays uncovered on the
            // left. Both slide up and can be flicked down to dismiss.
            className="absolute inset-x-0 bottom-0 max-h-[60vh] overflow-y-auto rounded-t-xl bg-bg-raised p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-text-primary shadow-[var(--shadow-e2)] lg:inset-x-auto lg:bottom-4 lg:right-4 lg:w-[30%] lg:max-h-[88vh] lg:rounded-2xl"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={springs.snappy}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120) onClose();
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="mx-auto mb-4 h-1.5 w-10 rounded-pill bg-text-disabled"
              aria-hidden="true"
            />
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
