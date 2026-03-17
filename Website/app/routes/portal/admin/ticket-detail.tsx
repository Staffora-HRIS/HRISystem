import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  ChevronRight,
  Send,
  RefreshCw,
  Clock,
  AlertTriangle,
  CheckCircle,
  Loader2,
  FileText,
  Download,
  ChevronDown,
  User,
  MessageSquare,
  Activity,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi } from "~/lib/portal-api";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface TicketMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  avatarUrl?: string;
  content: string;
  isInternalNote: boolean;
  attachments: { id: string; fileName: string; fileSize: number; url: string }[];
  createdAt: string;
}

interface ActivityEntry {
  id: string;
  actorName: string;
  action: string;
  details: string;
  createdAt: string;
}

interface AdminTicketDetail {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  assignedTo: string | null;
  assignedToName: string | null;
  sla: { dueAt: string | null; isBreached: boolean; remainingMinutes: number | null };
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  messages: TicketMessage[];
  activityLog: ActivityEntry[];
  agents: { id: string; name: string }[];
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const VALID_STATUSES = ["open", "in_progress", "awaiting_client", "resolved", "closed"];
const VALID_PRIORITIES = ["low", "medium", "high", "critical"];

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700", in_progress: "bg-yellow-100 text-yellow-700",
  awaiting_client: "bg-purple-100 text-purple-700", resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-700", medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700", critical: "bg-red-100 text-red-700",
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatRelative(d: string): string {
  const ms = Date.now() - new Date(d).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function formatLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function formatSla(min: number | null): string {
  if (min === null) return "N/A";
  if (min <= 0) return "Breached";
  const h = Math.floor(min / 60);
  return h > 0 ? `${h}h ${min % 60}m` : `${min}m`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function meta() {
  return [{ title: "Admin Ticket Detail - Staffora Client Portal" }];
}

export default function AdminTicketDetailPage() {
  const { ticketId } = useParams();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [ticket, setTicket] = useState<AdminTicketDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [replyText, setReplyText] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showActivity, setShowActivity] = useState(false);

  const fetchTicket = useCallback(async () => {
    if (!ticketId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = (await portalApi.tickets.get(ticketId)) as { data: AdminTicketDetail };
      setTicket(res.data);
    } catch { setError("Failed to load ticket."); }
    finally { setIsLoading(false); }
  }, [ticketId]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);

  useEffect(() => {
    if (ticket?.messages) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ticket?.messages]);

  async function handleUpdate(field: string, value: string) {
    if (!ticketId) return;
    try {
      await portalApi.admin.tickets.update(ticketId, { [field]: value });
      setToast(`${formatLabel(field)} updated`);
      setTimeout(() => setToast(null), 3000);
      fetchTicket();
    } catch { setError(`Failed to update ${field}.`); }
  }

  async function handleSendReply(e: FormEvent) {
    e.preventDefault();
    if (!replyText.trim() || !ticketId) return;
    setIsSending(true);
    try {
      await portalApi.tickets.reply(ticketId, { content: replyText.trim(), isInternalNote });
      setReplyText("");
      setIsInternalNote(false);
      setToast(isInternalNote ? "Internal note added" : "Reply sent");
      setTimeout(() => setToast(null), 3000);
      fetchTicket();
    } catch { setError("Failed to send reply."); }
    finally { setIsSending(false); }
  }

  if (isLoading) return <div className="space-y-4 animate-pulse"><div className="h-8 w-64 rounded bg-gray-200" /><div className="h-48 rounded-2xl bg-gray-200" /><div className="h-32 rounded-xl bg-gray-200" /></div>;
  if (error && !ticket) return <div className="text-center py-16"><AlertTriangle className="mx-auto h-12 w-12 text-red-400" /><p className="mt-4 text-gray-600">{error}</p><button onClick={fetchTicket} className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700"><RefreshCw className="mr-1 inline h-4 w-4" />Retry</button></div>;
  if (!ticket) return null;

  return (
    <div className="animate-fade-in">
      {toast && <div className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-medium text-green-700 shadow-lg animate-fade-in-down"><CheckCircle className="h-5 w-5 text-green-500" />{toast}</div>}

      <nav className="flex items-center gap-1.5 text-sm text-gray-500 mb-6" aria-label="Breadcrumb">
        <Link to="/portal/admin/tickets" className="inline-flex items-center gap-1 hover:text-brand-600 transition"><ArrowLeft className="h-3.5 w-3.5" />Ticket Management</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-mono font-medium text-gray-900">{ticket.ticketNumber}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main content */}
        <div className="space-y-6">
          {/* Header */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <h1 className="text-xl font-bold text-gray-900">{ticket.subject}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={cn("rounded-full px-3 py-1 text-xs font-medium", STATUS_COLORS[ticket.status])}>{formatLabel(ticket.status)}</span>
              <span className={cn("rounded-full px-3 py-1 text-xs font-medium", PRIORITY_COLORS[ticket.priority])}>{formatLabel(ticket.priority)}</span>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">{formatLabel(ticket.category)}</span>
            </div>
            <p className="mt-2 text-sm text-gray-500">Created {formatDate(ticket.createdAt)}</p>
          </div>

          {/* Messages */}
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900"><MessageSquare className="h-5 w-5" />Conversation</h2>
            {ticket.messages.map((msg) => {
              const isAgent = ["support_agent", "admin", "super_admin"].includes(msg.authorRole);
              return (
                <article key={msg.id} className={cn("rounded-xl border p-5", msg.isInternalNote ? "border-yellow-200 bg-yellow-50" : isAgent ? "border-blue-200 bg-blue-50/50" : "border-gray-200 bg-white")}>
                  {msg.isInternalNote && <span className="mb-2 inline-block rounded-full bg-yellow-200 px-2.5 py-0.5 text-xs font-medium text-yellow-800">Internal Note</span>}
                  <div className="flex items-start gap-3">
                    <div className={cn("flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white flex-shrink-0", isAgent ? "bg-brand-500" : "bg-gray-400")}>{getInitials(msg.authorName)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{msg.authorName}</span>
                        {isAgent && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">Staff</span>}
                        <span className="text-xs text-gray-400">{formatRelative(msg.createdAt)}</span>
                      </div>
                      <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{msg.content}</div>
                      {msg.attachments.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {msg.attachments.map((att) => (
                            <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs hover:bg-gray-50 transition">
                              <FileText className="h-3.5 w-3.5 text-gray-400" />{att.fileName} <span className="text-gray-400">({formatFileSize(att.fileSize)})</span><Download className="h-3 w-3 text-gray-400" />
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

          {/* Reply */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <form onSubmit={handleSendReply}>
              <textarea id="admin-reply" value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={4} placeholder={isInternalNote ? "Add an internal note..." : "Type your reply..."} className={cn("block w-full resize-y rounded-xl border px-4 py-3 text-sm shadow-sm transition placeholder:text-gray-400 focus:outline-none focus:ring-2", isInternalNote ? "border-yellow-300 bg-yellow-50 focus:border-yellow-400 focus:ring-yellow-200" : "border-gray-200 bg-white focus:border-brand-400 focus:ring-brand-200")} />
              <div className="mt-3 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={isInternalNote} onChange={(e) => setIsInternalNote(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-400" />
                  Internal note -- not visible to client
                </label>
                <button type="submit" disabled={isSending || !replyText.trim()} className={cn("inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition", isSending || !replyText.trim() ? "cursor-not-allowed bg-brand-400" : "bg-brand-600 hover:bg-brand-700")}>
                  {isSending ? <><Loader2 className="h-4 w-4 animate-spin" />Sending...</> : <><Send className="h-4 w-4" />{isInternalNote ? "Add Note" : "Send Reply"}</>}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Controls */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 block">Status</label>
              <select value={ticket.status} onChange={(e) => handleUpdate("status", e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-200">
                {VALID_STATUSES.map((s) => <option key={s} value={s}>{formatLabel(s)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 block">Priority</label>
              <select value={ticket.priority} onChange={(e) => handleUpdate("priority", e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-200">
                {VALID_PRIORITIES.map((p) => <option key={p} value={p}>{formatLabel(p)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 block">Assign To</label>
              <select value={ticket.assignedTo || ""} onChange={(e) => handleUpdate("assignedTo", e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-200">
                <option value="">Unassigned</option>
                {ticket.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 block">Category</label>
              <p className="text-sm text-gray-700">{formatLabel(ticket.category)}</p>
            </div>
          </div>

          {/* SLA */}
          <div className={cn("rounded-2xl border p-5", ticket.sla.isBreached ? "border-red-200 bg-red-50" : "border-gray-200 bg-white")}>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-2">
              <Clock className="h-4 w-4" /> SLA
            </h3>
            {ticket.sla.dueAt ? (
              <>
                <p className="text-sm text-gray-600">Due: {formatDate(ticket.sla.dueAt)}</p>
                <p className={cn("mt-1 text-sm font-medium", ticket.sla.isBreached ? "text-red-700" : "text-green-700")}>
                  {ticket.sla.isBreached ? "BREACHED" : formatSla(ticket.sla.remainingMinutes) + " remaining"}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No SLA configured</p>
            )}
          </div>

          {/* Activity Log */}
          <div className="rounded-2xl border border-gray-200 bg-white">
            <button onClick={() => setShowActivity(!showActivity)} className="flex w-full items-center justify-between px-5 py-4 text-sm font-semibold text-gray-900">
              <span className="flex items-center gap-2"><Activity className="h-4 w-4" />Activity Log</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", showActivity && "rotate-180")} />
            </button>
            {showActivity && (
              <div className="border-t border-gray-100 px-5 py-4 max-h-80 overflow-y-auto space-y-3">
                {ticket.activityLog.length === 0 ? (
                  <p className="text-sm text-gray-500">No activity recorded.</p>
                ) : (
                  ticket.activityLog.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-2">
                      <div className="mt-1 h-2 w-2 rounded-full bg-gray-300 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-700">
                          <span className="font-medium">{entry.actorName}</span> {entry.action}
                        </p>
                        {entry.details && <p className="text-xs text-gray-500">{entry.details}</p>}
                        <p className="text-xs text-gray-400">{formatRelative(entry.createdAt)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
