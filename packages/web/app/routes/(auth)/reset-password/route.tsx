/**
 * Reset Password Page
 */

import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { authApi } from "../../../lib/auth";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { useToast } from "../../../components/ui/toast";
import type { Route } from "./+types/route";

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export function meta(): Route.MetaDescriptors {
  return [
    { title: "Reset Password | Staffora" },
    { name: "description", content: "Set a new password" },
  ];
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const token = searchParams.get("token");

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<ResetPasswordFormData>();

  const password = watch("password", "");

  // Password strength indicator
  const getPasswordStrength = (pwd: string) => {
    let strength = 0;
    if (pwd.length >= 8) strength++;
    if (/[A-Z]/.test(pwd)) strength++;
    if (/[a-z]/.test(pwd)) strength++;
    if (/[0-9]/.test(pwd)) strength++;
    if (/[^A-Za-z0-9]/.test(pwd)) strength++;
    return strength;
  };

  const passwordStrength = getPasswordStrength(password);
  const strengthLabels = ["Very Weak", "Weak", "Fair", "Good", "Strong"];
  const strengthColors = [
    "bg-error-500",
    "bg-error-400",
    "bg-warning-500",
    "bg-success-400",
    "bg-success-500",
  ];

  const onSubmit = async (data: ResetPasswordFormData) => {
    if (!token) {
      toast.error("Invalid reset link");
      return;
    }

    setIsSubmitting(true);
    try {
      await authApi.confirmPasswordReset({
        token,
        password: data.password,
      });
      setIsSuccess(true);
    } catch (error) {
      toast.error("Failed to reset password", {
        message: "The reset link may have expired. Please request a new one.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-error-100 dark:bg-error-900/30">
          <svg
            className="h-8 w-8 text-error-600 dark:text-error-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
          Invalid Reset Link
        </h1>
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
          This password reset link is invalid or has expired.
        </p>

        <Link to="/forgot-password">
          <Button>Request New Link</Button>
        </Link>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30">
          <svg
            className="h-8 w-8 text-success-600 dark:text-success-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
          Password Reset Successfully
        </h1>
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
          Your password has been changed. You can now sign in with your new password.
        </p>

        <Link to="/login">
          <Button fullWidth>Sign in</Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="mb-2 text-center text-2xl font-bold text-gray-900 dark:text-white">
        Set new password
      </h1>
      <p className="mb-8 text-center text-sm text-gray-600 dark:text-gray-400">
        Your new password must be different from previously used passwords.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            placeholder="Enter your new password"
            error={errors.password?.message}
            {...register("password")}
          />

          {/* Password strength indicator */}
          {password && (
            <div className="mt-2">
              <div className="mb-1 flex gap-1">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full ${
                      i < passwordStrength
                        ? strengthColors[passwordStrength - 1]
                        : "bg-gray-200 dark:bg-gray-700"
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Password strength: {strengthLabels[passwordStrength - 1] || "Very Weak"}
              </p>
            </div>
          )}
        </div>

        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="Confirm your new password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />

        <Button type="submit" fullWidth loading={isSubmitting}>
          Reset password
        </Button>
      </form>

      <div className="mt-8 text-center">
        <Link
          to="/login"
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Back to login
        </Link>
      </div>
    </>
  );
}
