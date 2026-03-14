/**
 * Error Boundary Component
 *
 * Class component that catches render errors in its child tree.
 * Use this for wrapping sections of the UI that should fail
 * independently without crashing the entire app.
 *
 * For route-level errors, use RouteErrorBoundary with React Router instead.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomeComponent />
 *   </ErrorBoundary>
 *
 *   <ErrorBoundary fallback={<CustomFallback />}>
 *     <SomeComponent />
 *   </ErrorBoundary>
 *
 *   <ErrorBoundary sectionLabel="Employee Details" level="page">
 *     <Outlet />
 *   </ErrorBoundary>
 */

import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle, RefreshCw, ArrowLeft, Home } from "lucide-react";

export type ErrorBoundaryLevel = "section" | "page";

export interface ErrorBoundaryProps {
  /** Content to render when no error has occurred. */
  children: ReactNode;
  /** Optional custom fallback to render on error. Overrides the default UI. */
  fallback?: ReactNode;
  /** Optional callback invoked when an error is caught. */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Label describing the section, used in the default error UI. */
  sectionLabel?: string;
  /**
   * Controls the visual scale of the error UI.
   * - "section": Compact inline error card (default). Used for wrapping parts of a page.
   * - "page": Full-height centered error with navigation actions. Used for wrapping route Outlets.
   */
  level?: ErrorBoundaryLevel;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  handleGoBack = (): void => {
    window.history.back();
  };

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    const level = this.props.level ?? "section";

    if (level === "page") {
      return this.renderPageError();
    }

    return this.renderSectionError();
  }

  private renderSectionError(): ReactNode {
    const sectionLabel = this.props.sectionLabel || "This section";
    const isDev = typeof import.meta !== "undefined" && import.meta.env?.DEV;

    return (
      <div
        role="alert"
        className="rounded-lg border border-error-200 bg-error-50 p-6 dark:border-error-800 dark:bg-error-900/20"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error-100 dark:bg-error-900/40">
            <AlertTriangle className="h-5 w-5 text-error-600 dark:text-error-400" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {sectionLabel} encountered an error
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Something went wrong while rendering this content. You can try
              again, and if the problem persists, contact support.
            </p>

            {isDev && this.state.error && (
              <div className="mt-3 rounded-md border border-error-200 bg-white p-3 dark:border-error-800 dark:bg-gray-900">
                <p className="text-sm font-medium text-error-700 dark:text-error-400">
                  {this.state.error.message}
                </p>
                {this.state.error.stack && (
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-gray-500 dark:text-gray-500">
                    {this.state.error.stack}
                  </pre>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={this.handleRetry}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Try Again
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:ring-offset-gray-900"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  private renderPageError(): ReactNode {
    const sectionLabel = this.props.sectionLabel || "This page";
    const isDev = typeof import.meta !== "undefined" && import.meta.env?.DEV;

    return (
      <div
        role="alert"
        className="flex min-h-[50vh] items-center justify-center px-4"
      >
        <div className="max-w-lg text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-error-50 dark:bg-error-900/20">
            <AlertTriangle className="h-8 w-8 text-error-500 dark:text-error-400" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Something went wrong
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {sectionLabel} encountered an error while rendering.
            You can try again, go back, or return to the dashboard.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Try Again
            </button>
            <button
              type="button"
              onClick={this.handleGoBack}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:ring-offset-gray-900"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Go Back
            </button>
            <a
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:ring-offset-gray-900"
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              Dashboard
            </a>
          </div>

          {isDev && this.state.error && (
            <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4 text-left dark:border-gray-700 dark:bg-gray-800">
              <p className="text-sm font-medium text-error-600 dark:text-error-400">
                {this.state.error.message}
              </p>
              {this.state.error.stack && (
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-gray-600 dark:text-gray-400">
                  {this.state.error.stack}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
}
