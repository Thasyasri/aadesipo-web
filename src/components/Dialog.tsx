import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { useEffect, useRef, type ReactNode } from "react";
import { springs } from "@/theme/motion";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Reserved for blocking decisions. The app-level convention is: only ever
 * render one Dialog as `open` at a time — queue the rest — since stacked
 * modals aren't part of the design language. Enforcing that queue is a
 * product of whichever feature calls this, not this component's job.
 */
export function Dialog({ open, onClose, title, children }: DialogProps) {
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
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            tabIndex={-1}
            className="w-full max-w-md rounded-lg bg-bg-raised p-6 text-text-primary shadow-[var(--shadow-e3)]"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={springs.snappy}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="dialog-title" className="mb-4 font-display text-title">
              {title}
            </h2>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
