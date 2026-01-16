import { QueryClient, QueryFunction } from "@tanstack/react-query";

export type ApiError = Error & {
  status?: number;
  code?: string;
};

// ─────────────────────────────────────────────────────────────
// CSRF token storage (in-memory) + in-flight guard
let csrfToken: string | null = null;
let csrfInFlight: Promise<string> | null = null;

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch("/auth/csrf", {
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    const err: ApiError = Object.assign(new Error(`${res.status}: ${text}`), {
      status: res.status,
    });
    throw err;
  }

  const data = (await res.json()) as { csrfToken: string };
  csrfToken = data.csrfToken;
  return data.csrfToken;
}

/**
 * Ensure that a CSRF token exists in memory.
 * Uses an in-flight promise to prevent multiple parallel /auth/csrf calls.
 */
async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  if (!csrfInFlight) {
    csrfInFlight = fetchCsrfToken().finally(() => {
      csrfInFlight = null;
    });
  }
  return csrfInFlight;
}

// Optional pre-warm: call once at app start
export async function initCSRFToken() {
  try {
    await ensureCsrf();
  } catch (error) {
    console.error("Failed to prefetch CSRF token:", error);
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;

    const error: ApiError = Object.assign(new Error(`${res.status}: ${text}`), {
      status: res.status,
      code: res.status === 401 ? "UNAUTHORIZED" : undefined,
    });

    throw error;
  }
}

/**
 * Generic API request helper:
 * - JSON body support
 * - auto CSRF on mutations
 * - retries once if CSRF invalid (403)
 * - throws ApiError with status/code
 */
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
): Promise<Response> {
  const upperMethod = method.toUpperCase();
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(upperMethod);

  const headers: HeadersInit = data
    ? { "Content-Type": "application/json" }
    : {};

  if (isMutation) {
    // Ensure CSRF exists before sending mutation
    try {
      const token = await ensureCsrf();
      headers["x-csrf-token"] = token;
    } catch (e) {
      // proceed; server will reject if CSRF required
      console.error("Failed to ensure CSRF token:", e);
    }
  }

  const doFetch = async () => {
    const res = await fetch(url, {
      method: upperMethod,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
    return res;
  };

  let res = await doFetch();

  // If CSRF failed, refresh token and retry once
  if (isMutation && res.status === 403) {
    try {
      csrfToken = null; // force refresh
      const token = await ensureCsrf();
      (headers as any)["x-csrf-token"] = token;
      res = await doFetch();
    } catch (e) {
      // If refresh fails, fall through and throw original 403 details
      console.error("CSRF refresh after 403 failed:", e);
    }
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

export function getQueryFn<T>(options: {
  on401: UnauthorizedBehavior;
}): QueryFunction<T> {
  const { on401: unauthorizedBehavior } = options;

  return async ({ queryKey }) => {
    const url = queryKey.join("/") as string;

    const res = await fetch(url, {
      credentials: "include",
      cache: "no-store",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null as T;
    }

    await throwIfResNotOk(res);
    return (await res.json()) as T;
  };
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
