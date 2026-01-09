/**
 * Auth Guard Component
 *
 * Protects routes that require authentication.
 * Redirects to login if not authenticated.
 * 
 * IMPORTANT: Auth check is client-side only because SSR doesn't have access
 * to browser cookies. We use useEffect for redirects to ensure they only
 * happen on the client.
 */

import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router";
import { useSession } from "../../lib/better-auth";
import { Spinner } from "../ui/spinner";

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  redirectTo?: string;
}

export function AuthGuard({
  children,
  fallback,
  redirectTo = "/login",
}: AuthGuardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: session, isPending } = useSession();
  
  // Track if we're on the client (SSR doesn't have window)
  const [isClient, setIsClient] = useState(false);
  
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    // Only redirect on client-side, not during SSR
    if (isClient && !isPending && !session) {
      // Redirect to login with return URL
      const returnUrl = encodeURIComponent(location.pathname + location.search);
      navigate(`${redirectTo}?redirect=${returnUrl}`, { replace: true });
    }
  }, [session, isPending, navigate, location, redirectTo, isClient]);

  // Show loading state while checking auth (both SSR and client)
  if (!isClient || isPending) {
    return (
      fallback || (
        <div className="flex items-center justify-center min-h-screen">
          <Spinner size="lg" />
        </div>
      )
    );
  }

  // Not authenticated - will redirect via useEffect
  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  // Authenticated - render children
  return <>{children}</>;
}

export default AuthGuard;
