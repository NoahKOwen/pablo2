import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Pro Dashboard Button styling:
 * - Gradient backgrounds with smooth elevation
 * - Subtle glow hover effects
 * - Clean outline & ghost variants for secondary actions
 */

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          // Orange gradient with glow
          "bg-linear-to-r from-orange-500 to-amber-600 text-white shadow-[0_0_10px_rgba(255,140,0,0.15)] hover:shadow-[0_0_15px_rgba(255,140,0,0.3)] hover:scale-[1.02] border border-orange-500/20",
        destructive:
          "bg-linear-to-r from-red-600 to-rose-700 text-white shadow-[0_0_10px_rgba(255,0,0,0.2)] hover:shadow-[0_0_15px_rgba(255,0,0,0.35)] hover:scale-[1.02] border border-red-700/30",
        outline:
          "border border-gray-600/50 bg-transparent text-gray-200 hover:bg-gray-800/60 hover:text-white hover:scale-[1.01]",
        secondary:
          "bg-[#1b2233]/80 border border-gray-700 text-gray-200 hover:bg-[#242c3f] hover:border-gray-600 hover:text-white transition-all",
        ghost:
          "bg-transparent text-gray-400 hover:text-orange-400 hover:bg-orange-500/10 hover:scale-[1.03]",
      },
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-10 rounded-md px-8 text-base",
        icon: "h-9 w-9 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
