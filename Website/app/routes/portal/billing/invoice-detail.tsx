import { useState, useEffect, useCallback } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  ChevronRight,
  Download,
  Printer,
  FileText,
  AlertTriangle,
  RefreshCw,
  CheckCircle,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi } from "~/lib/portal-api";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface LineItem {
  description: string;
  module: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface InvoiceDetail {
  id: string;
  number: string;
  status: string;
  issuedDate: string;
  dueDate: string;
  paidDate: string | null;
  billTo: {
    companyName: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    postcode: string;
    country: string;
  };
  lineItems: LineItem[];
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  paymentMethod: string;
  paymentReference: string | null;
  downloadUrl: string;
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  void: "bg-gray-100 text-gray-500",
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
  return [{ title: "Invoice Detail - Staffora Client Portal" }];
}

export default function InvoiceDetailPage() {
  const { invoiceId } = useParams();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoice = useCallback(async () => {
    if (!invoiceId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = (await portalApi.billing.invoice(invoiceId)) as {
        data: InvoiceDetail;
      };
      setInvoice(res.data);
    } catch {
      setError("Failed to load invoice. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    fetchInvoice();
  }, [fetchInvoice]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 animate-pulse">
        <div className="h-4 w-32 rounded bg-gray-200" />
        <div className="h-64 w-full rounded-2xl bg-gray-200" />
        <div className="h-48 w-full rounded-2xl bg-gray-200" />
      </div>
    );
  }

  if (error && !invoice) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-16 px-6 text-center">
        <AlertTriangle className="h-12 w-12 text-red-400" />
        <h3 className="mt-4 text-lg font-semibold text-gray-900">Failed to load invoice</h3>
        <p className="mt-1.5 text-sm text-gray-500">{error}</p>
        <button
          onClick={fetchInvoice}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  if (!invoice) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500" aria-label="Breadcrumb">
        <Link to="/portal/billing" className="hover:text-brand-600 transition">
          Billing
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link to="/portal/billing/invoices" className="hover:text-brand-600 transition">
          Invoices
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-gray-900">{invoice.number}</span>
      </nav>

      {/* Invoice document */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden print:border-0 print:shadow-none">
        {/* Header */}
        <div className="border-b border-gray-100 p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              {/* Logo */}
              <div className="flex items-center gap-2.5 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-brand shadow-md shadow-brand-500/20">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <span className="text-xl font-bold text-gray-900">Staffora</span>
              </div>
              <p className="text-sm text-gray-500">
                Staffora Ltd<br />
                London, United Kingdom
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{invoice.number}</h1>
                <span className={cn("rounded-full px-3 py-1 text-xs font-medium", STATUS_COLORS[invoice.status] || "bg-gray-100 text-gray-600")}>
                  {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                </span>
              </div>
              <div className="mt-2 text-sm text-gray-500 space-y-0.5">
                <p>Issued: {formatDate(invoice.issuedDate)}</p>
                <p>Due: {formatDate(invoice.dueDate)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bill To */}
        <div className="border-b border-gray-100 px-8 py-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Bill To
          </p>
          <p className="text-sm font-medium text-gray-900">
            {invoice.billTo.companyName}
          </p>
          <p className="text-sm text-gray-500">
            {invoice.billTo.addressLine1}
            {invoice.billTo.addressLine2 && <><br />{invoice.billTo.addressLine2}</>}
            <br />
            {invoice.billTo.city}, {invoice.billTo.postcode}
            <br />
            {invoice.billTo.country}
          </p>
        </div>

        {/* Line Items */}
        <div className="px-8 py-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="pb-3 text-left font-semibold text-gray-600">Description</th>
                <th className="pb-3 text-left font-semibold text-gray-600">Module</th>
                <th className="pb-3 text-right font-semibold text-gray-600">Qty</th>
                <th className="pb-3 text-right font-semibold text-gray-600">Unit Price</th>
                <th className="pb-3 text-right font-semibold text-gray-600">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoice.lineItems.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-3 text-gray-900">{item.description}</td>
                  <td className="py-3 text-gray-500">{item.module}</td>
                  <td className="py-3 text-right text-gray-700">{item.quantity}</td>
                  <td className="py-3 text-right text-gray-700">{formatCurrency(item.unitPrice)}</td>
                  <td className="py-3 text-right font-medium text-gray-900">{formatCurrency(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="mt-6 flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium text-gray-900">{formatCurrency(invoice.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">VAT ({invoice.vatRate}%)</span>
                <span className="font-medium text-gray-900">{formatCurrency(invoice.vatAmount)}</span>
              </div>
              <div className="border-t border-gray-200 pt-2 flex items-center justify-between">
                <span className="text-base font-bold text-gray-900">Total</span>
                <span className="text-xl font-bold text-gray-900">{formatCurrency(invoice.total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Info */}
        {invoice.status === "paid" && (
          <div className="border-t border-gray-100 px-8 py-5 bg-green-50">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-800">
                  Paid on {formatDate(invoice.paidDate)}
                </p>
                <p className="text-xs text-green-700">
                  Method: {invoice.paymentMethod}
                  {invoice.paymentReference && <> -- Ref: {invoice.paymentReference}</>}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
        <a
          href={invoice.downloadUrl}
          download
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          <Download className="h-4 w-4" />
          Download PDF
        </a>
      </div>

      {/* Back link */}
      <div className="print:hidden">
        <Link
          to="/portal/billing/invoices"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to invoices
        </Link>
      </div>
    </div>
  );
}
