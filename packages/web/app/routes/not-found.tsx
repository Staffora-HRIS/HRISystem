/**
 * 404 Not Found Page
 */

import { Link } from "react-router";
import { Button } from "../components/ui/button";

export function meta() {
  return [
    { title: "Page Not Found | HRIS Platform" },
    { name: "description", content: "The page you're looking for doesn't exist" },
  ];
}

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="text-center">
        {/* 404 illustration */}
        <div className="mx-auto mb-8">
          <svg
            className="mx-auto h-48 w-48 text-gray-300 dark:text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={0.5}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <h1 className="text-6xl font-bold text-primary-600">404</h1>
        <h2 className="mt-4 text-2xl font-semibold text-gray-900 dark:text-white">
          Page Not Found
        </h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Sorry, we couldn&apos;t find the page you&apos;re looking for.
        </p>

        <div className="mt-8 flex justify-center gap-4">
          <Link to="/dashboard">
            <Button>Go to Dashboard</Button>
          </Link>
          <Button
            variant="outline"
            onClick={() => window.history.back()}
          >
            Go Back
          </Button>
        </div>

        <p className="mt-8 text-sm text-gray-500 dark:text-gray-400">
          If you believe this is an error, please{" "}
          <Link
            to="/me/cases"
            className="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
          >
            contact support
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
