// client/src/components/ui/use-toast.ts

export type ToastVariant = "default" | "destructive" | "success" | "info";

export type ToastOptions = {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
};

export type ToastFn = (options: ToastOptions) => void;

declare global {
  interface Window {
    __XNRT_FALLBACK_TOAST__?: ToastFn;
  }
}

/**
 * Very small, framework-agnostic toast helper.
 *
 * In the full app you use the shadcn toast system via `@/hooks/use-toast`.
 * This implementation is kept as a safe fallback so that components which
 * import `@/components/ui/use-toast` still work even if the provider
 * isn’t mounted (tests, Storybook, etc.).
 */
function createFallbackToast(): ToastFn {
  // Browser: reuse a single function so we don't re-create it constantly
  if (typeof window !== "undefined") {
    if (window.__XNRT_FALLBACK_TOAST__) {
      return window.__XNRT_FALLBACK_TOAST__;
    }

    const fn: ToastFn = (options) => {
      const message =
        options.description ||
        options.title ||
        "Something happened (toast fallback)";

      // Minimal but still useful for debugging
      // eslint-disable-next-line no-alert
      alert(message);
    };

    window.__XNRT_FALLBACK_TOAST__ = fn;
    return fn;
  }

  // SSR / non-browser env – just log
  const fn: ToastFn = (options) => {
    const message =
      options.description ||
      options.title ||
      "Something happened (toast fallback)";
    // eslint-disable-next-line no-console
    console.log("[toast]", options.variant ?? "default", message);
  };

  return fn;
}

/**
 * Minimal `useToast` implementation compatible with:
 *
 *   const { toast } = useToast();
 *   toast({ title, description, variant: "destructive" });
 *
 * You can later wire this file to your main toast store if you want,
 * but the external API can stay the same.
 */
export function useToast() {
  const toast = createFallbackToast();
  return { toast };
}
