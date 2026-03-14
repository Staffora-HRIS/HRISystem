/**
 * Route Error Boundary
 *
 * Reusable error boundary for route-level errors using React Router's
 * useRouteError() hook. Shows different UIs for 404, 403, 500, and
 * network/runtime errors.
 *
 * Usage: export as `ErrorBoundary` from any route or layout file:
 *   export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
 */

import { useState } from "react";
import { useRouteError, isRouteErrorResponse, useNavigate } from "react-router";
import { AlertTriangle, FileQuestion, ShieldX, RefreshCw, Home, ArrowLeft, WifiOff } from "lucide-react";

/**
 * Extracts a displayable error message from an unknown error value.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "An unexpected error occurred";
}

/**
 * Extracts a stack trace from an error (only shown in development).
 */
function getErrorStack(error: unknown): string | null {
  if (error instanceof Error && error.stack) return error.stack;
  return null;
}

/**
 * Checks if the error looks like a network failure.
 */
function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes("fetch")) return true;
  if (error instanceof Error && error.message.toLowerCase().includes("network")) return true;
  return false;
}

export function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);

  // Log the error for future error tracking integration
  // eslint-disable-next-line no-console
  console.error("[RouteErrorBoundary]", error);

  const isDev = import.meta.env.DEV;

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return (
        <div
          className="flex min-h-[50vh] items-center justify-center px-4"
          role="alert"
        >
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
              <FileQuestion className="h-8 w-8 text-gray-400 dark:text-gray-500" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
              404
            </h1>
            <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
              Page not found
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
              The page you are looking for does not exist or has been moved.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
              >
                <ArrowLeft className="h-4 w-4" />
                Go Back
              </button>
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:ring-offset-gray-900"
              >
                <Home className="h-4 w-4" />
                Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (error.status === 403) {
      return (
        <div
          className="flex min-h-[50vh] items-center justify-center px-4"
          role="alert"
        >
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-error-50 dark:bg-error-900/20">
              <ShieldX className="h-8 w-8 text-error-500 dark:text-error-400" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
              403
            </h1>
            <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
              Access denied
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
              You don&apos;t have permission to access this page. Contact your
              administrator if you believe this is a mistake.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
              >
                <Home className="h-4 w-4" />
                Dashboard
              </button>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:ring-offset-gray-900"
              >
                <ArrowLeft className="h-4 w-4" />
                Go Back
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Generic HTTP error (500, 502, etc.)
    return (
      <div
        className="flex min-h-[50vh] items-center justify-center px-4"
        role="alert"
      >
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-error-50 dark:bg-error-900/20">
            <AlertTriangle className="h-8 w-8 text-error-500 dark:text-error-400" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            {error.status}
          </h1>
          <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
            {error.statusText || "Something went wrong"}
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
            The server encountered an error. Please try again.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </button>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:ring-offset-gray-900"
            >
              <Home className="h-4 w-4" />
              Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Network error
  if (isNetworkError(error)) {
    return (
      <div
        className="flex min-h-[50vh] items-center justify-center px-4"
        role="alert"
      >
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning-50 dark:bg-warning-900/20">
            <WifiOff className="h-8 w-8 text-warning-500 dark:text-warning-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Connection Error
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Unable to connect to the server. Please check your internet
            connection and try again.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:ring-offset-gray-900"
            >
              <Home className="h-4 w-4" />
              Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Unknown/unhandled error (runtime exception, etc.)
  const errorMessage = getErrorMessage(error);
  const errorStack = isDev ? getErrorStack(error) : null;

  return (
    <div
      className="flex min-h-[50vh] items-center justify-center px-4"
      role="alert"
    >
      <div className="max-w-lg text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-error-50 dark:bg-error-900/20">
          <AlertTriangle className="h-8 w-8 text-error-500 dark:text-error-400" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Something went wrong
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          An unexpected error occurred. Please try again. If the problem
          persists, contact support.
        </p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:ring-offset-gray-900"
          >
            <Home className="h-4 w-4" />
            Dashboard
          </button>
        </div>

        {/* Development-mode error details */}
        {isDev && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="text-sm text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              {showDetails ? "Hide" : "Show"} error details
            </button>
            {showDetails && (
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-left dark:border-gray-700 dark:bg-gray-800">
                <p className="text-sm font-medium text-error-600 dark:text-error-400">
                  {errorMessage}
                </p>
                {errorStack && (
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-gray-600 dark:text-gray-400">
                    {errorStack}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
