export type ApiError = Error & {
  status?: number;
  code?: string;
};

export function isUnauthorizedError(error: unknown): boolean {
  const e = error as ApiError;

  if (typeof e?.status === "number") {
    return e.status === 401;
  }

  if (typeof e?.code === "string") {
    return e.code === "UNAUTHORIZED";
  }

  const msg = (e?.message || "").toLowerCase();
  return msg.includes("401") || msg.includes("unauthorized");
}

// Helper function to handle unauthorized errors consistently
export function handleUnauthorized(toast: (options: any) => void) {
  toast({
    title: "Session expired",
    description: "Please log in again to continue.",
    variant: "destructive",
  });

  // Give the toast a tick to render before redirect
  setTimeout(() => {
    // Canonical auth route
    window.location.assign("/auth");
  }, 500);
}
