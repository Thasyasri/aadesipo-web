import { motion } from "motion/react";
import type { HTMLAttributes, ReactNode } from "react";
import { springs, useMotionPrefs } from "@/theme/motion";

interface CardProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  | "onAnimationStart"
  | "onAnimationEnd"
  | "onAnimationIteration"
  | "onDrag"
  | "onDragStart"
  | "onDragEnd"
> {
  interactive?: boolean;
  children: ReactNode;
}

export function Card({ interactive = false, className = "", children, ...rest }: CardProps) {
  const { reduceMotion } = useMotionPrefs();

  return (
    <motion.div
      className={`rounded-md bg-bg-surface p-4 text-text-primary shadow-[var(--shadow-e1)] ${
        interactive ? "cursor-pointer" : ""
      } ${className}`}
      whileTap={
        interactive && !reduceMotion ? { scale: 0.98, filter: "brightness(1.05)" } : undefined
      }
      transition={springs.snappy}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
