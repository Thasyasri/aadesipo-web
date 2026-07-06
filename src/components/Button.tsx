import { motion } from "motion/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { springs, useMotionPrefs } from "@/theme/motion";

type Variant = "primary" | "secondary" | "tertiary" | "destructive" | "icon";

interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  | "children"
  | "onAnimationStart"
  | "onAnimationEnd"
  | "onAnimationIteration"
  | "onDrag"
  | "onDragStart"
  | "onDragEnd"
> {
  variant?: Variant;
  loading?: boolean;
  children?: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-brand-primary text-[#1A1200] rounded-pill px-6 py-3 font-semibold",
  secondary:
    "bg-transparent border border-[var(--color-text-secondary)] text-text-primary rounded-pill px-6 py-3 font-semibold",
  tertiary: "bg-transparent text-brand-primary-strong px-4 py-2 font-semibold",
  destructive: "bg-brand-secondary text-[#1A1200] rounded-pill px-6 py-3 font-semibold",
  icon: "bg-bg-surface text-text-primary rounded-full p-3",
};

/** Min touch target 48x48, per the design spec. */
export function Button({
  variant = "primary",
  loading = false,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const { reduceMotion } = useMotionPrefs();

  return (
    <motion.button
      type="button"
      className={`inline-flex min-h-12 min-w-12 items-center justify-center gap-2 font-body text-body-lg transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      disabled={disabled || loading}
      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
      transition={springs.snappy}
      {...rest}
    >
      {loading ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        children
      )}
    </motion.button>
  );
}
