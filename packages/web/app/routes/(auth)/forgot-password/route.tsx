/**
 * Forgot Password Page
 */

import { useState } from "react";
import { Link } from "react-router";
import { useForm } from "react-hook-form";
import { authApi } from "../../../lib/auth";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import type { Route } from "./+types/route";

interface ForgotPasswordFormData {
  email: string;
}

export function meta(): Route.MetaDescriptors {
  return [
    { title: "Forgot Password | Staffora" },
    { name: "description", content: "Reset your password" },
  ];
}

export default function ForgotPasswordPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm<ForgotPasswordFormData>();

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setIsSubmitting(true);
    try {
      await authApi.requestPasswordReset({ email: data.email });
      setIsSubmitted(true);
    } catch (error) {
      // Don't reveal if email exists or not for security
      setIsSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
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
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>

        <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
          Check your email
        </h1>
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
          If an account exists for <strong>{getValues("email")}</strong>, you will receive
          a password reset link shortly.
        </p>

        <p className="text-sm text-gray-500 dark:text-gray-400">
          Didn&apos;t receive the email?{" "}
          <button
            type="button"
            onClick={() => setIsSubmitted(false)}
            className="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
          >
            Try again
          </button>
        </p>

        <div className="mt-8">
          <Link
            to="/login"
            className="text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
          >
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <h1 className="mb-2 text-center text-2xl font-bold text-gray-900 dark:text-white">
        Forgot your password?
      </h1>
      <p className="mb-8 text-center text-sm text-gray-600 dark:text-gray-400">
        No worries, we&apos;ll send you reset instructions.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="name@company.com"
          error={errors.email?.message}
          {...register("email", {
            required: "Email address is required",
            pattern: {
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
              message: "Please enter a valid email address",
            },
          })}
        />

        <Button type="submit" fullWidth loading={isSubmitting}>
          Send reset link
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
