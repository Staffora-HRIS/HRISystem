import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ArrowLeft, Mail, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi } from "~/lib/portal-api";

export function meta() {
  return [
    { title: "Forgot Password - Staffora Client Portal" },
    {
      name: "description",
      content: "Reset your Staffora client portal password.",
    },
  ];
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [touched, setTouched] = useState(false);

  const emailError =
    touched && !email.trim()
      ? "Email is required"
      : touched && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ? "Enter a valid email address"
        : null;

  const canSubmit =
    email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);

    if (!canSubmit) return;

    setIsSubmitting(true);

    try {
      await portalApi.auth.forgotPassword(email);
    } catch {
      // Silently handle errors to avoid email enumeration
    } finally {
      setIsSubmitting(false);
      setIsSubmitted(true);
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
          {isSubmitted ? (
            /* Success state */
            <div className="text-center animate-fade-in">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-50">
                <CheckCircle2 className="h-7 w-7 text-accent-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">
                Check your email
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-gray-500">
                If an account exists with{" "}
                <span className="font-medium text-gray-700">{email}</span>,
                we&apos;ve sent a password reset link. Please check your inbox
                and spam folder.
              </p>
              <p className="mt-2 text-xs text-gray-400">
                The link will expire in 1 hour.
              </p>
              <Link
                to="/login"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-brand px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-brand-500/30 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </Link>
            </div>
          ) : (
            /* Form state */
            <>
              <div className="mb-6 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
                  <Mail className="h-7 w-7 text-brand-600" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Forgot your password?
                </h1>
                <p className="mt-1.5 text-sm text-gray-500">
                  Enter your email and we&apos;ll send you a reset link.
                </p>
              </div>

              <form
                onSubmit={handleSubmit}
                noValidate
                className="space-y-5"
              >
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
                    onBlur={() => setTouched(true)}
                    className={cn(
                      "block w-full rounded-xl border bg-white/80 px-4 py-3 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:outline-none focus:ring-2",
                      emailError
                        ? "border-red-300 focus:border-red-400 focus:ring-red-200"
                        : "border-gray-200 focus:border-brand-400 focus:ring-brand-200",
                    )}
                    placeholder="you@company.com"
                    aria-invalid={emailError ? "true" : undefined}
                    aria-describedby={
                      emailError ? "email-error" : undefined
                    }
                  />
                  {emailError && (
                    <p
                      id="email-error"
                      className="mt-1.5 text-xs text-red-600"
                    >
                      {emailError}
                    </p>
                  )}
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
                      Sending...
                    </>
                  ) : (
                    "Send reset link"
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
