import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Pro Dashboard Input:
 * - Dark glass background
 * - Soft border + glow on focus
 * - Smooth transitions
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-white/10 bg-[#1b2233]/70 backdrop-blur-sm px-3 py-2 text-sm text-gray-100",
        "placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-0 transition-all duration-300",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
export { Input };
