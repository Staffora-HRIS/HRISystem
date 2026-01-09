/**
 * Login Page
 *
 * Uses Better Auth for authentication.
 */

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardBody } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Spinner } from "../../../components/ui/spinner";
import { signInWithEmail, useSession } from "../../../lib/better-auth";

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

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const result = await signInWithEmail(data.email, data.password);
      if (result.error) {
        throw new Error(result.error.message || "Login failed");
      }
      return result.data;
    },
    onSuccess: (data) => {
      // Check if MFA/2FA redirect is needed (Better Auth uses 'redirect' property)
      if (data?.redirect) {
        navigate(data.url || "/mfa", { state: { from: redirectTo } });
      } else {
        // Use hard redirect to ensure session cookie is read fresh
        // React Router navigate doesn't always trigger useSession to refetch
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader bordered>
          <div className="text-center">
            <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-blue-100">
              <span className="text-2xl">🔐</span>
            </div>
            <h2 className="mt-4 text-2xl font-bold text-gray-900">Sign in to HRIS</h2>
            <p className="mt-2 text-sm text-gray-600">
              Enter your credentials to access the platform
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="mt-1"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                  Remember me
                </label>
              </div>

              <a href="/forgot-password" className="text-sm text-blue-600 hover:text-blue-500">
                Forgot password?
              </a>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
