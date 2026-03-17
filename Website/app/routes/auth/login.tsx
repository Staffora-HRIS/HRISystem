import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Eye, EyeOff, LogIn, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi, PortalApiError } from "~/lib/portal-api";

export function meta() {
  return [
    { title: "Sign In - Staffora Client Portal" },
    {
      name: "description",
      content: "Sign in to your Staffora client portal account.",
    },
  ];
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Field-level validation
  const [touched, setTouched] = useState({ email: false, password: false });

  const emailError =
    touched.email && !email.trim()
      ? "Email is required"
      : touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ? "Enter a valid email address"
        : null;

  const passwordError =
    touched.password && !password ? "Password is required" : null;

  const canSubmit =
    email.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    password.length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched({ email: true, password: true });

    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await portalApi.auth.login({ email, password, rememberMe });
      navigate("/portal/dashboard", { replace: true });
    } catch (err) {
      if (err instanceof PortalApiError) {
        if (err.status === 401) {
          setError("Invalid email or password. Please try again.");
        } else if (err.status === 429) {
          setError("Too many login attempts. Please try again later.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Unable to connect. Please check your connection and try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-grid opacity-50" />
      <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-brand-400/10 blur-3xl" />
      <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-accent-400/10 blur-3xl" />

      <div className="relative z-10 w-full max-w-md animate-fade-in-up">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-brand shadow-lg shadow-brand-500/25">
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6 text-white"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <span className="text-2xl font-bold tracking-tight text-gray-900">
              Staffora
            </span>
          </Link>
        </div>

        {/* Card */}
        <div className="glass-card rounded-2xl p-8">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
            <p className="mt-1.5 text-sm text-gray-500">
              Sign in to your client portal
            </p>
          </div>

          {/* Error alert */}
          {error && (
            <div
              className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 animate-fade-in"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() =>
                  setTouched((prev) => ({ ...prev, email: true }))
                }
                className={cn(
                  "block w-full rounded-xl border bg-white/80 px-4 py-3 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:outline-none focus:ring-2",
                  emailError
                    ? "border-red-300 focus:border-red-400 focus:ring-red-200"
                    : "border-gray-200 focus:border-brand-400 focus:ring-brand-200",
                )}
                placeholder="you@company.com"
                aria-invalid={emailError ? "true" : undefined}
                aria-describedby={emailError ? "email-error" : undefined}
              />
              {emailError && (
                <p id="email-error" className="mt-1.5 text-xs text-red-600">
                  {emailError}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() =>
                    setTouched((prev) => ({ ...prev, password: true }))
                  }
                  className={cn(
                    "block w-full rounded-xl border bg-white/80 px-4 py-3 pr-12 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:outline-none focus:ring-2",
                    passwordError
                      ? "border-red-300 focus:border-red-400 focus:ring-red-200"
                      : "border-gray-200 focus:border-brand-400 focus:ring-brand-200",
                  )}
                  placeholder="Enter your password"
                  aria-invalid={passwordError ? "true" : undefined}
                  aria-describedby={
                    passwordError ? "password-error" : undefined
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:text-gray-600 transition focus:outline-none focus:ring-2 focus:ring-brand-200"
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                >
                  {showPassword ? (
                    <EyeOff className="h-4.5 w-4.5" />
                  ) : (
                    <Eye className="h-4.5 w-4.5" />
                  )}
                </button>
              </div>
              {passwordError && (
                <p
                  id="password-error"
                  className="mt-1.5 text-xs text-red-600"
                >
                  {passwordError}
                </p>
              )}
            </div>

            {/* Remember me + forgot */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 transition"
                />
                <span className="text-sm text-gray-600">Remember me</span>
              </label>
              <Link
                to="/forgot-password"
                className="text-sm font-medium text-brand-600 hover:text-brand-700 transition"
              >
                Forgot password?
              </Link>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2",
                isSubmitting
                  ? "cursor-not-allowed bg-brand-400"
                  : "bg-gradient-brand hover:shadow-brand-500/30 hover:-translate-y-0.5 active:translate-y-0",
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  Sign in
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-400">
          Need an account?{" "}
          <Link
            to="/contact"
            className="font-medium text-brand-600 hover:text-brand-700 transition"
          >
            Contact us
          </Link>{" "}
          to get started.
        </p>
        <p className="mt-3 text-center text-xs text-gray-400">
          &copy; {new Date().getFullYear()} Staffora. All rights reserved.
        </p>
      </div>
    </div>
  );
}
