import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import {
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  Download,
  FileText,
  Eye,
  Search,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi } from "~/lib/portal-api";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Invoice {
  id: string;
  number: string;
  period: string;
  amount: number;
  status: string;
  dueDate: string;
  paidDate: string | null;
  downloadUrl: string;
}

interface InvoiceListResponse {
  data: Invoice[];
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
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "void", label: "Void" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  void: "bg-gray-100 text-gray-500 line-through",
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatCurrency(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function meta() {
  return [{ title: "Invoices - Staffora Client Portal" }];
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<InvoiceListResponse["pagination"]>({
    hasMore: false,
    nextCursor: null,
    prevCursor: null,
  });

  const [status, setStatus] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [direction, setDirection] = useState<"next" | "prev">("next");

  const fetchInvoices = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (cursor) {
        params.set("cursor", cursor);
        params.set("direction", direction);
      }
      const res = (await portalApi.billing.invoices(params)) as InvoiceListResponse;
      setInvoices(res.data);
      setPagination(res.pagination);
    } catch {
      setError("Failed to load invoices. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [status, cursor, direction]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  useEffect(() => {
    setCursor(null);
  }, [status]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500" aria-label="Breadcrumb">
        <Link to="/portal/billing" className="inline-flex items-center gap-1 hover:text-brand-600 transition">
          <ArrowLeft className="h-3.5 w-3.5" />
          Billing
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-gray-900">Invoices</span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
        <p className="mt-1 text-sm text-gray-500">
          View and download all your invoices.
        </p>
      </div>

      {/* Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
          aria-label="Filter by status"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          {error}
          <button onClick={fetchInvoices} className="ml-2 font-medium underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white px-5 py-4 animate-pulse">
              <div className="h-4 w-32 rounded bg-gray-200" />
              <div className="h-4 w-20 rounded bg-gray-200 flex-1" />
              <div className="h-5 w-16 rounded-full bg-gray-200" />
              <div className="h-4 w-20 rounded bg-gray-200" />
              <div className="h-8 w-20 rounded-lg bg-gray-200" />
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && invoices.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-16 px-6 text-center">
          <FileText className="h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No invoices found</h3>
          <p className="mt-1.5 text-sm text-gray-500">
            {status ? "Try changing your filter." : "Your invoices will appear here once generated."}
          </p>
        </div>
      )}

      {/* Table */}
      {!isLoading && !error && invoices.length > 0 && (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="px-5 py-3.5 font-semibold text-gray-600">Invoice #</th>
                    <th className="px-5 py-3.5 font-semibold text-gray-600">Period</th>
                    <th className="px-5 py-3.5 font-semibold text-gray-600 text-right">Amount</th>
                    <th className="px-5 py-3.5 font-semibold text-gray-600">Status</th>
                    <th className="px-5 py-3.5 font-semibold text-gray-600">Due Date</th>
                    <th className="px-5 py-3.5 font-semibold text-gray-600">Paid Date</th>
                    <th className="px-5 py-3.5 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-xs font-medium text-brand-600">
                          {inv.number}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-700">{inv.period}</td>
                      <td className="px-5 py-3.5 text-right font-semibold text-gray-900">
                        {formatCurrency(inv.amount)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={cn("rounded-full px-3 py-1 text-xs font-medium", STATUS_COLORS[inv.status] || "bg-gray-100 text-gray-600")}>
                          {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-500">{formatDate(inv.dueDate)}</td>
                      <td className="px-5 py-3.5 text-gray-500">{formatDate(inv.paidDate)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <a
                            href={inv.downloadUrl}
                            download
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                            aria-label={`Download ${inv.number}`}
                          >
                            <Download className="h-3.5 w-3.5" />
                            PDF
                          </a>
                          <Link
                            to={`/portal/billing/invoices/${inv.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-3">
            <button
              onClick={() => { if (pagination.prevCursor) { setDirection("prev"); setCursor(pagination.prevCursor); } }}
              disabled={!pagination.prevCursor}
              className={cn("inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition", pagination.prevCursor ? "text-gray-700 hover:bg-gray-100" : "cursor-not-allowed text-gray-300")}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <button
              onClick={() => { if (pagination.nextCursor) { setDirection("next"); setCursor(pagination.nextCursor); } }}
              disabled={!pagination.hasMore}
              className={cn("inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition", pagination.hasMore ? "text-gray-700 hover:bg-gray-100" : "cursor-not-allowed text-gray-300")}
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
