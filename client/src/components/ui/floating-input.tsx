import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * FloatingInput — Pro Dashboard Edition
 * - Dark glass background with subtle glow
 * - Smooth floating label animation
 * - Error state with red glow
 */

export interface FloatingInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

const FloatingInput = React.forwardRef<HTMLInputElement, FloatingInputProps>(
  ({ className, label, error, type = "text", ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false);
    const [hasValue, setHasValue] = React.useState(false);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      props.onFocus?.(e);
    };
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      setHasValue(!!e.target.value);
      props.onBlur?.(e);
    };

    React.useEffect(() => {
      setHasValue(!!props.value || !!props.defaultValue);
    }, [props.value, props.defaultValue]);

    const isActive = isFocused || hasValue;

    return (
      <div className="relative w-full">
        <input
          type={type}
          ref={ref}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={label}
          className={cn(
            "peer w-full rounded-md border px-4 pb-2 pt-6 text-sm text-gray-100 placeholder-transparent transition-all duration-300 ease-out",
            // background / border
            "bg-[#1b2233]/70 border-white/10 backdrop-blur-sm",
            // focus & hover states
            isFocused
              ? "border-orange-500/60 shadow-[0_0_10px_rgba(255,140,0,0.25)]"
              : error
                ? "border-red-500/50 shadow-[0_0_10px_rgba(255,0,0,0.25)]"
                : "hover:border-orange-500/40",
            // error on focus override
            error &&
              isFocused &&
              "border-red-500 shadow-[0_0_12px_rgba(255,0,0,0.4)]",
            "focus:outline-none focus:ring-0",
            className,
          )}
          {...props}
        />
        <label
          className={cn(
            "absolute left-4 transition-all duration-300 pointer-events-none",
            "text-gray-400",
            isActive
              ? "top-1.5 text-xs text-orange-400"
              : "top-1/2 -translate-y-1/2 text-sm text-gray-500",
            error && "text-red-400",
          )}
        >
          {label}
        </label>

        {error && (
          <p className="mt-1.5 text-xs font-medium text-red-500 animate-in fade-in duration-300">
            {error}
          </p>
        )}
      </div>
    );
  },
);

FloatingInput.displayName = "FloatingInput";
export { FloatingInput };
