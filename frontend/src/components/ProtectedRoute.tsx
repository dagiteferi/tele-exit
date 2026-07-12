import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAuth, type Role } from "@/lib/auth";
import { AppSplash } from "@/components/AppSplash";

/**
 * Client-side route guard.
 *
 * IMPORTANT: This is UX-only. The real security boundary is the backend —
 * every protected API call must return 401/403 for the wrong user/role,
 * and this component simply keeps unauthorized users out of screens that
 * would only be confusing without a session. Do not rely on this check
 * for security decisions.
 */
export function ProtectedRoute({
  children,
  role,
}: {
  children: ReactNode;
  role?: Role;
}) {
  const { user, ready } = useAuth();

  if (!ready) return <AppSplash />;
  if (!user) return <Navigate to="/login" />;
  if (role && user.role !== role) return <Navigate to="/dashboard" />;
  return <>{children}</>;
}
