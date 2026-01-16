// client/src/lib/csrf.ts

let csrfToken: string | null = null;

export function getCsrfToken(): string | null {
  return csrfToken;
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

/**
 * Ensure that a CSRF token exists in memory.
 * If we already have one cached, it is returned.
 * Otherwise we fetch `/auth/csrf` and cache + return it.
 */
export async function ensureCsrf(): Promise<string> {
  if (csrfToken) {
    // Narrow to non-null for TypeScript
    return csrfToken;
  }

  const res = await fetch("/auth/csrf", {
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Failed to fetch CSRF token");
  }

  const body = (await res.json()) as { csrfToken: string };
  csrfToken = body.csrfToken;
  return body.csrfToken;
}
