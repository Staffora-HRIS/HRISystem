/**
 * Route Loading Skeleton
 *
 * Loading fallback component for route-level Suspense boundaries.
 * Displays a page-like skeleton that matches the typical admin/app page
 * structure with a header area, stat cards, and content area.
 *
 * Usage:
 *   <Suspense fallback={<RouteLoadingSkeleton />}>
 *     <Outlet />
 *   </Suspense>
 */

import { Skeleton } from "./skeleton";
import { Spinner } from "./spinner";

/**
 * Full page loading skeleton with animated placeholders.
 * Mimics a typical page layout: header + cards + table area.
 */
export function RouteLoadingSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading page content">
      {/* Page header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton height={28} width={200} rounded="md" />
          <Skeleton height={16} width={300} rounded="md" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton height={36} width={100} rounded="lg" />
          <Skeleton height={36} width={120} rounded="lg" />
        </div>
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="flex items-center gap-4">
              <Skeleton width={48} height={48} rounded="lg" />
              <div className="flex-1 space-y-2">
                <Skeleton height={14} width="60%" rounded="md" />
                <Skeleton height={24} width="40%" rounded="md" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Content area skeleton */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        {/* Toolbar row */}
        <div className="flex items-center gap-4 border-b border-gray-200 p-4 dark:border-gray-700">
          <Skeleton height={36} className="flex-1 max-w-xs" rounded="lg" />
          <Skeleton height={36} width={120} rounded="lg" />
          <Skeleton height={36} width={120} rounded="lg" />
        </div>

        {/* Table header */}
        <div className="flex gap-4 border-b border-gray-100 px-6 py-3 dark:border-gray-700">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={14} className="flex-1" rounded="md" />
          ))}
        </div>

        {/* Table rows */}
        {Array.from({ length: 6 }).map((_, rowIdx) => (
          <div
            key={rowIdx}
            className="flex items-center gap-4 border-b border-gray-50 px-6 py-4 last:border-0 dark:border-gray-800"
          >
            <Skeleton width={40} height={40} rounded="full" />
            <div className="flex flex-1 gap-4">
              {Array.from({ length: 4 }).map((_, colIdx) => (
                <Skeleton key={colIdx} height={14} className="flex-1" rounded="md" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Compact loading state with just a centered spinner.
 * Use for smaller sections or simpler loading scenarios.
 */
export function RouteLoadingSpinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    </div>
  );
}
