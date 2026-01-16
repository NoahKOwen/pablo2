// client/src/components/GlobalQueryErrorHandler.tsx

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isUnauthorizedError, handleUnauthorized } from "@/lib/authUtils";
import { useToast } from "@/hooks/use-toast";

let hasHandledUnauthorized = false;

/**
 * Listens to ALL React Query errors (queries + mutations).
 * On first 401, shows a toast and redirects using handleUnauthorized().
 */
export function GlobalQueryErrorHandler() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    // --- Query errors ---
    const queryUnsub = queryClient.getQueryCache().subscribe((event) => {
      const query = event.query;
      const state = query?.state as
        | { status: string; error?: unknown }
        | undefined;

      if (!state || state.status !== "error" || !state.error) {
        return;
      }

      if (!hasHandledUnauthorized && isUnauthorizedError(state.error)) {
        // Avoid loops on /login
        if (window.location.pathname.startsWith("/login")) return;
        hasHandledUnauthorized = true;
        handleUnauthorized(toast);
      }
    });

    // --- Mutation errors ---
    const mutationUnsub = queryClient.getMutationCache().subscribe((event) => {
      const mutation = event.mutation;
      const state = mutation?.state as
        | { status: string; error?: unknown }
        | undefined;

      if (!state || state.status !== "error" || !state.error) {
        return;
      }

      if (!hasHandledUnauthorized && isUnauthorizedError(state.error)) {
        if (window.location.pathname.startsWith("/login")) return;
        hasHandledUnauthorized = true;
        handleUnauthorized(toast);
      }
    });

    return () => {
      queryUnsub();
      mutationUnsub();
    };
  }, [queryClient, toast]);

  return null;
}
