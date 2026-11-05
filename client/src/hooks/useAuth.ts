// client/src/hooks/useAuth.ts

import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  referralCode: string;
  emailVerified: boolean;
  isAdmin: boolean;
  xp: number;
  level: number;
  streak: number;
  lastCheckIn: string | null;
  createdAt: string;
}

export function useAuth() {
  const {
    data: user,
    isLoading,
    error,
  } = useQuery<AuthUser | null>({
    queryKey: ["/auth/me"],
    // When 401 → return null instead of throwing an error
    queryFn: getQueryFn<AuthUser | null>({ on401: "returnNull" }),
    retry: false,
  });

  return {
    user,
    isLoading,
    error,
    isAuthenticated: !!user,
  };
}
