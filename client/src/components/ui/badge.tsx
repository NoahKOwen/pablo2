import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Pro Dashboard Badge styling:
 * - Compact, high-contrast status labels
 * - Soft glows, dark backgrounds
 * - Animated transitions for hover states
 */

const badgeVariants = cva(
  "whitespace-nowrap inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-all duration-300 ease-out focus:outline-none select-none",
  {
    variants: {
      variant: {
        // 🔸 Default: orange-accent tag (used for active/primary status)
        default:
          "bg-linear-to-r from-orange-500/90 to-amber-600/90 text-white border border-orange-500/20 shadow-[0_0_8px_rgba(255,140,0,0.2)] hover:shadow-[0_0_10px_rgba(255,140,0,0.35)]",
        // ⚙️ Secondary: neutral glass tag (used for inactive or withdrawn)
        secondary:
          "bg-[#1b2233]/70 border border-white/10 text-gray-300 hover:bg-[#242c3f]/80 hover:text-white",
        // ❗ Destructive: red-accent warning badge
        destructive:
          "bg-linear-to-r from-red-600/90 to-rose-700/90 text-white border border-red-600/30 shadow-[0_0_8px_rgba(255,0,0,0.2)] hover:shadow-[0_0_10px_rgba(255,0,0,0.35)]",
        // 🩶 Outline: minimalist label for filters/tags
        outline:
          "bg-transparent border border-gray-600/50 text-gray-300 hover:bg-gray-800/60 hover:text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "transition-transform hover:scale-[1.05] cursor-default",
        badgeVariants({ variant }),
        className,
      )}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
