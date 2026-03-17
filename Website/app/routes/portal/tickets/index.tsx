import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Ticket,
  Loader2,
  Inbox,
  Filter,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi } from "~/lib/portal-api";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface TicketSummary {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: "low" | "medium" | "high" | "critical";
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface TicketListResponse {
  data: TicketSummary[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    prevCursor: string | null;
  };
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const STATUSES = [
  { value: "", label: "All Statuses" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "awaiting_client", label: "Awaiting Reply" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const CATEGORIES = [
  { value: "", label: "All Categories" },
  { value: "technical", label: "Technical Issue" },
  { value: "billing", label: "Billing" },
  { value: "feature_request", label: "Feature Request" },
  { value: "account", label: "Account" },
  { value: "integration", label: "Integration" },
  { value: "data", label: "Data" },
  { value: "security", label: "Security" },
  { value: "general", label: "General" },
];

const PRIORITIES = [
  { value: "", label: "All Priorities" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  awaiting_client: "bg-purple-100 text-purple-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
};

const CATEGORY_COLORS: Record<string, string> = {
  technical: "bg-indigo-100 text-indigo-700",
  billing: "bg-emerald-100 text-emerald-700",
  feature_request: "bg-violet-100 text-violet-700",
  account: "bg-cyan-100 text-cyan-700",
  integration: "bg-amber-100 text-amber-700",
  data: "bg-teal-100 text-teal-700",
  security: "bg-red-100 text-red-700",
  general: "bg-gray-100 text-gray-700",
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatStatusLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

/* -------------------------------------------------------------------------- */
/*  Skeleton Loader                                                            */
/* -------------------------------------------------------------------------- */

function TicketTableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white px-5 py-4 animate-pulse"
        >
          <div className="h-4 w-32 rounded bg-gray-200" />
          <div className="h-4 w-48 rounded bg-gray-200 flex-1" />
          <div className="h-5 w-20 rounded-full bg-gray-200" />
          <div className="h-5 w-16 rounded-full bg-gray-200" />
          <div className="h-5 w-20 rounded-full bg-gray-200" />
          <div className="h-4 w-16 rounded bg-gray-200" />
          <div className="h-4 w-16 rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function meta() {
  return [{ title: "Support Tickets - Staffora Portal" }];
}

export default function TicketListPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<TicketListResponse["pagination"]>({
    hasMore: false,
    nextCursor: null,
    prevCursor: null,
  });

  // Filters
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [direction, setDirection] = useState<"next" | "prev">("next");

  const fetchTickets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (category) params.set("category", category);
      if (priority) params.set("priority", priority);
      if (search.trim()) params.set("search", search.trim());
      if (cursor) {
        params.set("cursor", cursor);
        params.set("direction", direction);
      }
      const res = (await portalApi.tickets.list(params)) as TicketListResponse;
      setTickets(res.data);
      setPagination(res.pagination);
    } catch {
      setError("Failed to load tickets. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [status, category, priority, search, cursor, direction]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Reset cursor when filters change
  useEffect(() => {
    setCursor(null);
  }, [status, category, priority, search]);

  function handleNext() {
    if (pagination.nextCursor) {
      setDirection("next");
      setCursor(pagination.nextCursor);
    }
  }

  function handlePrev() {
    if (pagination.prevCursor) {
      setDirection("prev");
      setCursor(pagination.prevCursor);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support Tickets</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage your support requests
          </p>
        </div>
        <Link
          to="/portal/tickets/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
        >
          <Plus className="h-4 w-4" />
          New Ticket
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
          <Filter className="h-4 w-4" />
          <span className="sr-only sm:not-sr-only">Filters</span>
        </div>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
          aria-label="Filter by status"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
          aria-label="Filter by category"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>

        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
          aria-label="Filter by priority"
        >
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ticket # or subject..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
            aria-label="Search tickets"
          />
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          {error}
          <button
            onClick={fetchTickets}
            className="ml-2 font-medium text-red-800 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && <TicketTableSkeleton />}

      {/* Empty State */}
      {!isLoading && !error && tickets.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-16 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
            <Inbox className="h-8 w-8 text-brand-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">
            No tickets found
          </h3>
          <p className="mt-1.5 max-w-sm text-sm text-gray-500">
            {search || status || category || priority
              ? "Try adjusting your filters to find what you're looking for."
              : "You haven't created any support tickets yet. Get started by creating your first ticket."}
          </p>
          {!search && !status && !category && !priority && (
            <Link
              to="/portal/tickets/new"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" />
              Create your first ticket
            </Link>
          )}
        </div>
      )}

      {/* Ticket Table */}
      {!isLoading && !error && tickets.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white lg:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Ticket #</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Subject</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Category</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Priority</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Status</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Created</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => navigate(`/portal/tickets/${ticket.id}`)}
                    className="cursor-pointer transition-colors hover:bg-gray-50"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/portal/tickets/${ticket.id}`);
                      }
                    }}
                    role="link"
                    aria-label={`View ticket ${ticket.ticketNumber}: ${ticket.subject}`}
                  >
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-xs font-medium text-brand-600">
                        {ticket.ticketNumber}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-medium text-gray-900">
                      {truncate(ticket.subject, 60)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-medium",
                          CATEGORY_COLORS[ticket.category] || "bg-gray-100 text-gray-700",
                        )}
                      >
                        {formatStatusLabel(ticket.category)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-medium",
                          PRIORITY_COLORS[ticket.priority],
                        )}
                      >
                        {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-medium",
                          STATUS_COLORS[ticket.status] || "bg-gray-100 text-gray-600",
                        )}
                      >
                        {formatStatusLabel(ticket.status)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500">
                      {formatRelativeTime(ticket.createdAt)}
                    </td>
                    <td className="px-5 py-3.5 text-gray-500">
                      {formatRelativeTime(ticket.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 lg:hidden">
            {tickets.map((ticket) => (
              <Link
                key={ticket.id}
                to={`/portal/tickets/${ticket.id}`}
                className="block rounded-xl border border-gray-200 bg-white p-4 transition hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs font-medium text-brand-600">
                    {ticket.ticketNumber}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium",
                      STATUS_COLORS[ticket.status] || "bg-gray-100 text-gray-600",
                    )}
                  >
                    {formatStatusLabel(ticket.status)}
                  </span>
                </div>
                <p className="mt-2 font-medium text-gray-900">
                  {truncate(ticket.subject, 60)}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium",
                      CATEGORY_COLORS[ticket.category] || "bg-gray-100 text-gray-700",
                    )}
                  >
                    {formatStatusLabel(ticket.category)}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium",
                      PRIORITY_COLORS[ticket.priority],
                    )}
                  >
                    {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                  </span>
                  <span className="ml-auto text-xs text-gray-400">
                    {formatRelativeTime(ticket.createdAt)}
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-3">
            <button
              onClick={handlePrev}
              disabled={!pagination.prevCursor}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition",
                pagination.prevCursor
                  ? "text-gray-700 hover:bg-gray-100"
                  : "cursor-not-allowed text-gray-300",
              )}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <button
              onClick={handleNext}
              disabled={!pagination.hasMore}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition",
                pagination.hasMore
                  ? "text-gray-700 hover:bg-gray-100"
                  : "cursor-not-allowed text-gray-300",
              )}
              aria-label="Next page"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
