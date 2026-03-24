/**
 * Login Form Component
 *
 * Uses Better Auth for authentication.
 * Supports email/password login with MFA.
 */

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { signInWithEmail } from "../../lib/better-auth";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";

interface LoginFormProps {
  onSuccess?: () => void;
  onMfaRequired?: () => void;
}

export function LoginForm({ onSuccess, onMfaRequired }: LoginFormProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await signInWithEmail(email, password);

      if (result.error) {
        setError(result.error.message || "Login failed");
        return;
      }

      // Check if redirect is needed (e.g., MFA verification)
      if (result.data?.redirect) {
        onMfaRequired?.();
        navigate(result.data.url || "/mfa");
        return;
      }

      // Success
      onSuccess?.();
      navigate(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="username"
          disabled={isLoading}
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          autoComplete="current-password"
          disabled={isLoading}
        />
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Spinner size="sm" />
            <span className="ml-2">Signing in...</span>
          </>
        ) : (
          "Sign In"
        )}
      </Button>
    </form>
  );
}

export default LoginForm;
