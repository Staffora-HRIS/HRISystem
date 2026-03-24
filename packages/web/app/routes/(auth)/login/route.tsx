/**
 * Login Page
 *
 * Uses Better Auth for authentication.
 */

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { signInWithEmail, useSession, getCurrentSession } from "../../../lib/better-auth";
import type { Route } from "./+types/route";

export function meta(): Route.MetaDescriptors {
  return [
    { title: "Sign In | Staffora" },
    { name: "description", content: "Sign in to your Staffora account" },
  ];
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  // Get current session state - if already logged in, redirect immediately
  const { data: session, isPending: isSessionLoading } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isSessionLoading && session) {
      navigate(redirectTo, { replace: true });
    }
  }, [session, isSessionLoading, navigate, redirectTo]);

  const waitForSession = async () => {
    for (let i = 0; i < 10; i++) {
      const result = await getCurrentSession();
      if (result.data?.session) return;
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error("Session not established. Please try again.");
  };

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const result = await signInWithEmail(data.email, data.password);
      if (result.error) {
        throw new Error(result.error.message || "Login failed");
      }

      // If Better Auth indicates a redirect (e.g. MFA), don't wait for session here.
      // Otherwise, wait until the session is actually readable before redirecting
      // to avoid the first /dashboard request being unauthenticated.
      if (!result.data?.redirect) {
        await waitForSession();
      }

      return result.data;
    },
    onSuccess: (data) => {
      // Check if MFA/2FA redirect is needed (Better Auth uses 'redirect' property)
      if (data?.redirect) {
        navigate(data.url || "/mfa", { state: { from: redirectTo, mfaToken: data.token || "pending" } });
      } else {
        window.location.href = redirectTo;
      }
    },
    onError: (err: any) => {
      setError(err.message || "Login failed. Please check your credentials.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    loginMutation.mutate({ email, password });
  };

  return (
    <>
      <h1 className="mb-2 text-center text-2xl font-bold text-gray-900 dark:text-white">
        Sign in to Staffora
      </h1>
      <p className="mb-8 text-center text-sm text-gray-600 dark:text-gray-400">
        Enter your credentials to access the platform
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div
            className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/20 dark:text-error-400"
            role="alert"
          >
            {error}
          </div>
        )}

        <Input
          id="email"
          name="email"
          type="email"
          label="Email address"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          disabled={loginMutation.isPending}
        />

        <Input
          id="password"
          name="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          disabled={loginMutation.isPending}
        />

        <div className="flex items-center justify-end">
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
          >
            Forgot password?
          </Link>
        </div>

        <Button
          type="submit"
          fullWidth
          loading={loginMutation.isPending}
        >
          Sign in
        </Button>
      </form>
    </>
  );
}
