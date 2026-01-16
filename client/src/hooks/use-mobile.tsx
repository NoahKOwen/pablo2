// client/src/hooks/use-mobile.tsx

import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(
      `(max-width: ${MOBILE_BREAKPOINT - 1}px)`,
    );

    const handleChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    // Initial value
    handleChange();

    // Modern browsers
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
    }
    // Older Safari (<14) fallback
    else if (typeof (mediaQuery as any).addListener === "function") {
      (mediaQuery as any).addListener(handleChange);
    }

    return () => {
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", handleChange);
      } else if (typeof (mediaQuery as any).removeListener === "function") {
        (mediaQuery as any).removeListener(handleChange);
      }
    };
  }, []);

  return isMobile;
}
