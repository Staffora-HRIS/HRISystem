import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import {
  ChevronRight,
  Download,
  Send,
  RefreshCw,
  Clock,
  AlertTriangle,
  CheckCircle,
  Loader2,
  ArrowLeft,
  FileText,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi } from "~/lib/portal-api";
import { usePortalAuth } from "~/hooks/use-portal-auth";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface TicketMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: "client" | "support_agent" | "admin" | "super_admin" | "system";
  avatarUrl?: string;
  content: string;
  isInternalNote: boolean;
  attachments: {
    id: string;
    fileName: string;
    fileSize: number;
    url: string;
  }[];
  createdAt: string;
}

interface TicketDetail {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: "low" | "medium" | "high" | "critical";
  status: string;
  sla: {
    dueAt: string | null;
    isBreached: boolean;
    remainingMinutes: number | null;
  };
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  messages: TicketMessage[];
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

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

const STATUS_STEPS = ["open", "in_progress", "resolved", "closed"];
const STATUS_STEP_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(dateStr);
}

function formatSlaTime(minutes: number | null): string {
  if (minutes === null) return "N/A";
  if (minutes <= 0) return "Breached";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m remaining`;
  return `${m}m remaining`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/* -------------------------------------------------------------------------- */
/*  Skeleton                                                                   */
/* -------------------------------------------------------------------------- */

function DetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-6 w-48 rounded bg-gray-200" />
      <div className="h-10 w-96 rounded bg-gray-200" />
      <div className="flex gap-2">
        <div className="h-6 w-20 rounded-full bg-gray-200" />
        <div className="h-6 w-20 rounded-full bg-gray-200" />
        <div className="h-6 w-20 rounded-full bg-gray-200" />
      </div>
      <div className="h-16 w-full rounded-xl bg-gray-200" />
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 w-full rounded-xl bg-gray-200" />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function meta() {
  return [{ title: "Ticket Detail - Staffora Portal" }];
}

export default function TicketDetailPage() {
  const { ticketId } = useParams();
  const { user } = usePortalAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reply state
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fetchTicket = useCallback(async () => {
    if (!ticketId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = (await portalApi.tickets.get(ticketId)) as { data: TicketDetail };
      setTicket(res.data);
    } catch {
      setError("Failed to load ticket. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  useEffect(() => {
    if (ticket?.messages) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [ticket?.messages]);

  async function handleSendReply(e: FormEvent) {
    e.preventDefault();
    if (!replyText.trim() || !ticketId) return;

    setIsSending(true);
    try {
      await portalApi.tickets.reply(ticketId, {
        content: replyText.trim(),
        isInternalNote: false,
      });
      setReplyText("");
      setToast("Reply sent successfully");
      setTimeout(() => setToast(null), 3000);
      fetchTicket();
    } catch {
      setError("Failed to send reply. Please try again.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleReopen() {
    if (!ticketId) return;
    if (!window.confirm("Are you sure you want to reopen this ticket?")) return;

    try {
      await portalApi.tickets.reply(ticketId, {
        content: "Ticket reopened by client.",
        reopen: true,
      });
      setToast("Ticket reopened successfully");
      setTimeout(() => setToast(null), 3000);
      fetchTicket();
    } catch {
      setError("Failed to reopen ticket. Please try again.");
    }
  }

  if (isLoading) {
    return <DetailSkeleton />;
  }

  if (error && !ticket) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-16 px-6 text-center">
        <AlertTriangle className="h-12 w-12 text-red-400" />
        <h3 className="mt-4 text-lg font-semibold text-gray-900">
          Failed to load ticket
        </h3>
        <p className="mt-1.5 text-sm text-gray-500">{error}</p>
        <button
          onClick={fetchTicket}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  if (!ticket) return null;

  const currentStepIndex = STATUS_STEPS.indexOf(ticket.status);
  const isResolved = ticket.status === "resolved";
  const isClosed = ticket.status === "closed";
  const canReopen =
    isClosed &&
    ticket.closedAt &&
    new Date().getTime() - new Date(ticket.closedAt).getTime() <
      30 * 24 * 60 * 60 * 1000;

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-medium text-green-700 shadow-lg animate-fade-in-down">
          <CheckCircle className="h-5 w-5 text-green-500" />
          {toast}
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500" aria-label="Breadcrumb">
        <Link to="/portal/tickets" className="inline-flex items-center gap-1 hover:text-brand-600 transition">
          <ArrowLeft className="h-3.5 w-3.5" />
          Tickets
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-mono font-medium text-gray-900">
          {ticket.ticketNumber}
        </span>
      </nav>

      {/* Header */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="font-mono text-sm font-medium text-brand-600">
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
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  PRIORITY_COLORS[ticket.priority],
                )}
              >
                {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
              </span>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  CATEGORY_COLORS[ticket.category] || "bg-gray-100 text-gray-700",
                )}
              >
                {formatStatusLabel(ticket.category)}
              </span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">{ticket.subject}</h1>
            <p className="mt-1 text-sm text-gray-500">
              Created {formatDate(ticket.createdAt)}
            </p>
          </div>

          {/* SLA */}
          {!isClosed && ticket.sla.dueAt && (
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium",
                ticket.sla.isBreached
                  ? "bg-red-50 text-red-700"
                  : ticket.sla.remainingMinutes !== null &&
                      ticket.sla.remainingMinutes < 60
                    ? "bg-yellow-50 text-yellow-700"
                    : "bg-blue-50 text-blue-700",
              )}
            >
              {ticket.sla.isBreached ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <Clock className="h-4 w-4" />
              )}
              <span>
                SLA:{" "}
                {ticket.sla.isBreached
                  ? "Breached"
                  : formatSlaTime(ticket.sla.remainingMinutes)}
              </span>
            </div>
          )}
        </div>

        {/* Status progress bar */}
        <div className="mt-6">
          <div className="flex items-center justify-between" role="progressbar" aria-valuemin={0} aria-valuemax={STATUS_STEPS.length - 1} aria-valuenow={Math.max(currentStepIndex, 0)}>
            {STATUS_STEPS.map((step, index) => {
              const isActive = index <= currentStepIndex;
              const isCurrent = step === ticket.status;
              return (
                <div key={step} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition",
                        isCurrent
                          ? "bg-brand-600 text-white ring-4 ring-brand-100"
                          : isActive
                            ? "bg-brand-500 text-white"
                            : "bg-gray-200 text-gray-500",
                      )}
                    >
                      {isActive && index < currentStepIndex ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <span
                      className={cn(
                        "mt-1.5 text-xs font-medium",
                        isCurrent ? "text-brand-700" : isActive ? "text-gray-700" : "text-gray-400",
                      )}
                    >
                      {STATUS_STEP_LABELS[step]}
                    </span>
                  </div>
                  {index < STATUS_STEPS.length - 1 && (
                    <div
                      className={cn(
                        "mx-2 h-0.5 flex-1",
                        index < currentStepIndex ? "bg-brand-500" : "bg-gray-200",
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Conversation Thread */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Conversation</h2>

        {ticket.messages.map((msg) => {
          const isClient = msg.authorRole === "client";
          const isInternal = msg.isInternalNote;
          const isAgent = ["support_agent", "admin", "super_admin"].includes(msg.authorRole);

          // Skip internal notes for non-agent users
          if (isInternal && user?.role === "client") return null;

          return (
            <article
              key={msg.id}
              className={cn(
                "rounded-xl border p-5",
                isInternal
                  ? "border-yellow-200 bg-yellow-50"
                  : isAgent
                    ? "border-blue-200 bg-blue-50/50"
                    : "border-gray-200 bg-white",
              )}
            >
              {isInternal && (
                <div className="mb-3 flex items-center gap-1.5">
                  <span className="rounded-full bg-yellow-200 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                    Internal Note
                  </span>
                </div>
              )}

              <div className="flex items-start gap-3">
                {/* Avatar */}
                {msg.avatarUrl ? (
                  <img
                    src={msg.avatarUrl}
                    alt=""
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white",
                      isAgent ? "bg-brand-500" : "bg-gray-400",
                    )}
                  >
                    {getInitials(msg.authorName)}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">
                      {msg.authorName}
                    </span>
                    {isAgent && (
                      <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                        {msg.authorRole === "support_agent" ? "Agent" : "Staff"}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {formatRelativeTime(msg.createdAt)}
                    </span>
                  </div>

                  {/* Message content -- rendered safely as text */}
                  <div className="mt-2 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                    {msg.content}
                  </div>

                  {/* Attachments */}
                  {msg.attachments.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {msg.attachments.map((att) => (
                        <a
                          key={att.id}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 hover:border-gray-300"
                        >
                          <FileText className="h-4 w-4 text-gray-400" />
                          <span className="font-medium">{att.fileName}</span>
                          <span className="text-xs text-gray-400">
                            ({formatFileSize(att.fileSize)})
                          </span>
                          <Download className="h-3.5 w-3.5 text-gray-400" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Reply Section */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        {isClosed ? (
          <div className="text-center">
            <p className="text-sm text-gray-500">
              This ticket was closed on{" "}
              {ticket.closedAt ? formatDate(ticket.closedAt) : "N/A"}.
            </p>
            {canReopen && (
              <button
                onClick={handleReopen}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                <RefreshCw className="h-4 w-4" />
                Reopen Ticket
              </button>
            )}
            {!canReopen && ticket.closedAt && (
              <p className="mt-2 text-xs text-gray-400">
                Tickets can only be reopened within 30 days of closure.
              </p>
            )}
          </div>
        ) : isResolved ? (
          <div className="text-center">
            <div className="mb-3 flex items-center justify-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span className="text-sm font-medium">This ticket has been resolved</span>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              If the issue persists, you can reopen this ticket.
            </p>
            <button
              onClick={handleReopen}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              Reopen Ticket
            </button>
          </div>
        ) : (
          <form onSubmit={handleSendReply}>
            <label htmlFor="reply" className="sr-only">
              Reply
            </label>
            <textarea
              id="reply"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={4}
              placeholder="Type your reply..."
              className="block w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
            <div className="mt-3 flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={isSending || !replyText.trim()}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition",
                  isSending || !replyText.trim()
                    ? "cursor-not-allowed bg-brand-400"
                    : "bg-brand-600 hover:bg-brand-700",
                )}
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send Reply
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
