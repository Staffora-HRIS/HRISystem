import { useState, useMemo, type FormEvent } from "react";
import { Link, useSearchParams, useNavigate } from "react-router";
import {
  ArrowLeft,
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Check,
  X,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi, PortalApiError } from "~/lib/portal-api";

export function meta() {
  return [
    { title: "Reset Password - Staffora Client Portal" },
    {
      name: "description",
      content: "Set a new password for your Staffora client portal account.",
    },
  ];
}

interface PasswordRequirement {
  label: string;
  test: (pw: string) => boolean;
}

const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { label: "At least 8 characters", test: (pw) => pw.length >= 8 },
  { label: "One uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  { label: "One lowercase letter", test: (pw) => /[a-z]/.test(pw) },
  { label: "One number", test: (pw) => /\d/.test(pw) },
  {
    label: "One special character",
    test: (pw) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw),
  },
];

function getStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  const met = PASSWORD_REQUIREMENTS.filter((r) => r.test(password)).length;
  if (met === 0) return { score: 0, label: "", color: "bg-gray-200" };
  if (met <= 2) return { score: 1, label: "Weak", color: "bg-red-500" };
  if (met <= 3) return { score: 2, label: "Fair", color: "bg-amber-500" };
  if (met <= 4) return { score: 3, label: "Good", color: "bg-brand-500" };
  return { score: 4, label: "Strong", color: "bg-accent-500" };
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState({
    password: false,
    confirmPassword: false,
  });

  const strength = useMemo(() => getStrength(password), [password]);

  const allRequirementsMet = PASSWORD_REQUIREMENTS.every((r) =>
    r.test(password),
  );
  const passwordsMatch = password === confirmPassword;
  const confirmError =
    touched.confirmPassword && confirmPassword && !passwordsMatch
      ? "Passwords do not match"
      : null;
  const canSubmit = allRequirementsMet && passwordsMatch && token;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched({ password: true, confirmPassword: true });

    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await portalApi.auth.resetPassword({ token, password });
      setIsSuccess(true);
    } catch (err) {
      if (err instanceof PortalApiError) {
        if (err.status === 400) {
          setError(
            "This reset link has expired or is invalid. Please request a new one.",
          );
        } else {
          setError(err.message);
        }
      } else {
        setError(
          "Unable to connect. Please check your connection and try again.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  // Missing token
  if (!token && !isSuccess) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
        <div className="absolute inset-0 bg-grid opacity-50" />
        <div className="relative z-10 w-full max-w-md animate-fade-in-up">
          <div className="glass-card rounded-2xl p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
              <AlertCircle className="h-7 w-7 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              Invalid reset link
            </h1>
            <p className="mt-3 text-sm text-gray-500">
              This password reset link is missing or malformed. Please request a
              new one.
            </p>
            <Link
              to="/forgot-password"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-brand px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-brand-500/30 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2"
            >
              Request new link
            </Link>
          </div>
        </div>
      </div>
    );
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
          {isSuccess ? (
            /* Success state */
            <div className="text-center animate-fade-in">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-50">
                <CheckCircle2 className="h-7 w-7 text-accent-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">
                Password updated
              </h1>
              <p className="mt-3 text-sm text-gray-500">
                Your password has been successfully reset. You can now sign in
                with your new password.
              </p>
              <button
                onClick={() => navigate("/login")}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-brand px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-brand-500/30 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2"
              >
                Sign in
              </button>
            </div>
          ) : (
            /* Form state */
            <>
              <div className="mb-6 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
                  <KeyRound className="h-7 w-7 text-brand-600" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Set new password
                </h1>
                <p className="mt-1.5 text-sm text-gray-500">
                  Choose a strong password for your account.
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

              <form
                onSubmit={handleSubmit}
                noValidate
                className="space-y-5"
              >
                {/* New password */}
                <div>
                  <label
                    htmlFor="password"
                    className="mb-1.5 block text-sm font-medium text-gray-700"
                  >
                    New password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onBlur={() =>
                        setTouched((prev) => ({ ...prev, password: true }))
                      }
                      className="block w-full rounded-xl border border-gray-200 bg-white/80 px-4 py-3 pr-12 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                      placeholder="Enter new password"
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
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {/* Strength bar */}
                  {password.length > 0 && (
                    <div className="mt-3 animate-fade-in">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                          Password strength
                        </span>
                        <span
                          className={cn(
                            "text-xs font-medium",
                            strength.score <= 1
                              ? "text-red-600"
                              : strength.score === 2
                                ? "text-amber-600"
                                : strength.score === 3
                                  ? "text-brand-600"
                                  : "text-accent-600",
                          )}
                        >
                          {strength.label}
                        </span>
                      </div>
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4].map((level) => (
                          <div
                            key={level}
                            className={cn(
                              "h-1.5 flex-1 rounded-full transition-all duration-300",
                              level <= strength.score
                                ? strength.color
                                : "bg-gray-200",
                            )}
                          />
                        ))}
                      </div>

                      {/* Requirements checklist */}
                      <ul className="mt-3 space-y-1.5">
                        {PASSWORD_REQUIREMENTS.map((req) => {
                          const met = req.test(password);
                          return (
                            <li
                              key={req.label}
                              className="flex items-center gap-2 text-xs"
                            >
                              {met ? (
                                <Check className="h-3.5 w-3.5 text-accent-500" />
                              ) : (
                                <X className="h-3.5 w-3.5 text-gray-300" />
                              )}
                              <span
                                className={
                                  met ? "text-accent-700" : "text-gray-500"
                                }
                              >
                                {req.label}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Confirm password */}
                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="mb-1.5 block text-sm font-medium text-gray-700"
                  >
                    Confirm password
                  </label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onBlur={() =>
                        setTouched((prev) => ({
                          ...prev,
                          confirmPassword: true,
                        }))
                      }
                      className={cn(
                        "block w-full rounded-xl border bg-white/80 px-4 py-3 pr-12 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:outline-none focus:ring-2",
                        confirmError
                          ? "border-red-300 focus:border-red-400 focus:ring-red-200"
                          : "border-gray-200 focus:border-brand-400 focus:ring-brand-200",
                      )}
                      placeholder="Confirm new password"
                      aria-invalid={confirmError ? "true" : undefined}
                      aria-describedby={
                        confirmError ? "confirm-error" : undefined
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:text-gray-600 transition focus:outline-none focus:ring-2 focus:ring-brand-200"
                      aria-label={
                        showConfirmPassword
                          ? "Hide password"
                          : "Show password"
                      }
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {confirmError && (
                    <p
                      id="confirm-error"
                      className="mt-1.5 text-xs text-red-600"
                    >
                      {confirmError}
                    </p>
                  )}
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isSubmitting || !canSubmit}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2",
                    isSubmitting || !canSubmit
                      ? "cursor-not-allowed bg-brand-400"
                      : "bg-gradient-brand hover:shadow-brand-500/30 hover:-translate-y-0.5 active:translate-y-0",
                  )}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    "Reset password"
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 transition"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-400">
          &copy; {new Date().getFullYear()} Staffora. All rights reserved.
        </p>
      </div>
    </div>
  );
}
