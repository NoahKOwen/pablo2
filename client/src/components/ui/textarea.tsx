import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Pro Dashboard Textarea:
 * - Dark translucent background
 * - Soft orange glow focus ring
 * - Smooth transitions and readable typography
 */

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        // Base styling
        "flex min-h-[100px] w-full rounded-md border px-3 py-2 text-sm text-gray-100 resize-y transition-all duration-300 ease-out",
        // Dark background and blur
        "bg-[#1b2233]/70 backdrop-blur-sm border-white/10",
        // Placeholder and focus states
        "placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-0 focus-visible:border-orange-500/60 focus-visible:shadow-[0_0_10px_rgba(255,140,0,0.25)]",
        // Hover and disabled
        "hover:border-orange-500/40 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});

Textarea.displayName = "Textarea";

export { Textarea };
