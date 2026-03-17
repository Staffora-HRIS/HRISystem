import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router";
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Ticket,
  Loader2,
  Download,
  AlertTriangle,
  Clock,
  CheckCircle,
  Users,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi } from "~/lib/portal-api";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface AdminTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  assignedTo: string | null;
  assignedToName: string | null;
  slaStatus: "on_track" | "at_risk" | "breached";
  createdAt: string;
  updatedAt: string;
}

interface AdminTicketStats {
  open: number;
  inProgress: number;
  awaitingClient: number;
  slaBreached: number;
}

interface AdminTicketListResponse {
  data: AdminTicket[];
  stats: AdminTicketStats;
  agents: { id: string; name: string }[];
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
  { value: "awaiting_client", label: "Awaiting Client" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const CATEGORIES = [
  { value: "", label: "All Categories" },
  { value: "technical", label: "Technical" },
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

const SLA_COLORS: Record<string, string> = {
  on_track: "bg-green-100 text-green-700",
  at_risk: "bg-yellow-100 text-yellow-700",
  breached: "bg-red-100 text-red-700",
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function formatLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function meta() {
  return [{ title: "Ticket Management - Staffora Client Portal" }];
}

export default function AdminTicketsPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [stats, setStats] = useState<AdminTicketStats>({ open: 0, inProgress: 0, awaitingClient: 0, slaBreached: 0 });
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<AdminTicketListResponse["pagination"]>({ hasMore: false, nextCursor: null, prevCursor: null });

  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [direction, setDirection] = useState<"next" | "prev">("next");

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAssign, setBulkAssign] = useState("");
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkPriority, setBulkPriority] = useState("");

  const fetchTickets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (category) params.set("category", category);
      if (priority) params.set("priority", priority);
      if (assignedTo) params.set("assignedTo", assignedTo);
      if (unassignedOnly) params.set("unassigned", "true");
      if (search.trim()) params.set("search", search.trim());
      if (cursor) { params.set("cursor", cursor); params.set("direction", direction); }
      const res = (await portalApi.admin.tickets.list(params)) as AdminTicketListResponse;
      setTickets(res.data);
      setStats(res.stats);
      setAgents(res.agents || []);
      setPagination(res.pagination);
    } catch {
      setError("Failed to load tickets.");
    } finally {
      setIsLoading(false);
    }
  }, [status, category, priority, assignedTo, unassignedOnly, search, cursor, direction]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);
  useEffect(() => { setCursor(null); }, [status, category, priority, assignedTo, unassignedOnly, search]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === tickets.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(tickets.map((t) => t.id)));
    }
  }

  async function handleBulkApply() {
    if (selected.size === 0) return;
    const updates: Record<string, unknown> = {};
    if (bulkAssign) updates.assignedTo = bulkAssign;
    if (bulkStatus) updates.status = bulkStatus;
    if (bulkPriority) updates.priority = bulkPriority;
    if (Object.keys(updates).length === 0) return;

    try {
      for (const id of selected) {
        await portalApi.admin.tickets.update(id, updates);
      }
      setSelected(new Set());
      setBulkAssign("");
      setBulkStatus("");
      setBulkPriority("");
      fetchTickets();
    } catch {
      setError("Failed to apply bulk actions.");
    }
  }

  const statCards = [
    { label: "Open Tickets", value: stats.open, color: "bg-blue-50 text-blue-700", icon: Ticket },
    { label: "In Progress", value: stats.inProgress, color: "bg-yellow-50 text-yellow-700", icon: Clock },
    { label: "Awaiting Client", value: stats.awaitingClient, color: "bg-purple-50 text-purple-700", icon: Users },
    { label: "SLA Breached", value: stats.slaBreached, color: "bg-red-50 text-red-700", icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ticket Management</h1>
          <p className="mt-1 text-sm text-gray-500">Manage all support tickets across clients.</p>
        </div>
        <button
          onClick={() => {/* CSV export */}}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className={cn("rounded-2xl border border-gray-200 bg-white p-5")}>
              <div className="flex items-center gap-3">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", card.color)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">{card.label}</p>
                  <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 lg:flex-row lg:items-center lg:flex-wrap">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" aria-label="Status">
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" aria-label="Category">
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" aria-label="Priority">
          {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" aria-label="Assigned to">
          <option value="">All Agents</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={unassignedOnly} onChange={(e) => setUnassignedOnly(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-600" />
          Unassigned only
        </label>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tickets..." className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200" aria-label="Search" />
        </div>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <span className="text-sm font-medium text-brand-700">{selected.size} selected</span>
          <select value={bulkAssign} onChange={(e) => setBulkAssign(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm" aria-label="Bulk assign">
            <option value="">Assign to...</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm" aria-label="Bulk status">
            <option value="">Change status...</option>
            {STATUSES.filter((s) => s.value).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={bulkPriority} onChange={(e) => setBulkPriority(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm" aria-label="Bulk priority">
            <option value="">Change priority...</option>
            {PRIORITIES.filter((p) => p.value).map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <button onClick={handleBulkApply} className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 transition">
            Apply
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          {error}
          <button onClick={fetchTickets} className="ml-2 font-medium underline hover:no-underline">Retry</button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl border border-gray-100 bg-white animate-pulse" />
          ))}
        </div>
      )}

      {/* Table */}
      {!isLoading && !error && tickets.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="px-4 py-3">
                    <input type="checkbox" checked={selected.size === tickets.length && tickets.length > 0} onChange={toggleSelectAll} className="h-4 w-4 rounded border-gray-300 text-brand-600" aria-label="Select all" />
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Ticket #</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Subject</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Priority</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Assigned To</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">SLA</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tickets.map((ticket) => (
                  <tr key={ticket.id} className="cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => navigate(`/portal/admin/tickets/${ticket.id}`)}>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(ticket.id)} onChange={() => toggleSelect(ticket.id)} className="h-4 w-4 rounded border-gray-300 text-brand-600" aria-label={`Select ${ticket.ticketNumber}`} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-brand-600">{ticket.ticketNumber}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{truncate(ticket.subject, 50)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", PRIORITY_COLORS[ticket.priority])}>{formatLabel(ticket.priority)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_COLORS[ticket.status])}>{formatLabel(ticket.status)}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{ticket.assignedToName || <span className="italic text-gray-400">Unassigned</span>}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", SLA_COLORS[ticket.slaStatus])}>{formatLabel(ticket.slaStatus)}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatRelativeTime(ticket.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && tickets.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-16 text-center">
          <Ticket className="h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No tickets found</h3>
          <p className="mt-1.5 text-sm text-gray-500">Try adjusting your filters.</p>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && tickets.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-3">
          <button onClick={() => { if (pagination.prevCursor) { setDirection("prev"); setCursor(pagination.prevCursor); } }} disabled={!pagination.prevCursor} className={cn("inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition", pagination.prevCursor ? "text-gray-700 hover:bg-gray-100" : "cursor-not-allowed text-gray-300")} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <button onClick={() => { if (pagination.nextCursor) { setDirection("next"); setCursor(pagination.nextCursor); } }} disabled={!pagination.hasMore} className={cn("inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition", pagination.hasMore ? "text-gray-700 hover:bg-gray-100" : "cursor-not-allowed text-gray-300")} aria-label="Next">
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
