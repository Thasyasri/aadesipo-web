import { AnimatePresence, motion, useDragControls } from "motion/react";
import { createPortal } from "react-dom";
import { useEffect, useRef, type ReactNode } from "react";
import { springs } from "@/theme/motion";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /**
   * A pinned action row rendered *below* the scroll area, so a sheet's primary
   * actions (Buy, Send offer, Bid, Accept…) stay reachable without scrolling —
   * critical on short/landscape phone viewports where the body overflows.
   */
  footer?: ReactNode;
}

/**
 * The primary container for in-game decisions (buy? auction? trade?).
 *
 * Layout is a flex column: a fixed drag handle, a scrollable body, and an
 * optional pinned footer. Capped at 85% of the viewport so some board stays
 * visible behind/beside it. Dismiss-by-swipe is driven only from the drag
 * handle (via drag controls), so it never fights the body's own scroll.
 */
export function BottomSheet({ open, onClose, children, footer }: BottomSheetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
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
          className="fixed inset-0 z-40 bg-black/25 md:bg-black/10"
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
            // left. Both slide up and can be flicked down (from the handle) to
            // dismiss. Bottom safe-area padding keeps the footer above the home
            // indicator on iOS.
            className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-xl bg-bg-raised pb-[env(safe-area-inset-bottom)] text-text-primary shadow-[var(--shadow-e2)] md:inset-x-auto md:bottom-4 md:right-4 md:max-h-[88vh] md:w-[34%] md:min-w-[320px] md:max-w-[420px] md:rounded-2xl"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={springs.snappy}
            drag="y"
            // Drag is started only from the handle below (dragListener off), so
            // scrolling the body never accidentally dismisses the sheet.
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120) onClose();
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="shrink-0 cursor-grab touch-none pb-2 pt-3"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div
                className="mx-auto h-1.5 w-10 rounded-pill bg-text-disabled"
                aria-hidden="true"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">{children}</div>
            {footer && (
              <div className="shrink-0 border-t border-black/10 px-6 pb-2 pt-3 dark:border-white/10">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
