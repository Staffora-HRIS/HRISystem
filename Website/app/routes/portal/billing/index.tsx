import { useState, useEffect } from "react";
import { Link } from "react-router";
import {
  CreditCard,
  FileText,
  ArrowRight,
  Calendar,
  Package,
  CheckCircle,
  XCircle,
  Banknote,
  RefreshCw,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi } from "~/lib/portal-api";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ActiveModule {
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  isEnabled: boolean;
}

interface BillingOverview {
  plan: {
    name: string;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    nextRenewalDate: string;
    autoRenew: boolean;
  };
  modules: ActiveModule[];
  breakdown: {
    basePlan: number;
    moduleTotal: number;
    subtotal: number;
    vatRate: number;
    vatAmount: number;
    total: number;
  };
  paymentMethod: {
    type: "card" | "bank_transfer";
    cardBrand?: string;
    last4: string;
    expiry?: string;
    bankName?: string;
  } | null;
  recentInvoices: {
    id: string;
    number: string;
    amount: number;
    status: string;
    date: string;
  }[];
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatCurrency(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  trialling: "bg-blue-100 text-blue-700",
  past_due: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
};

const INVOICE_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  void: "bg-gray-100 text-gray-500 line-through",
};

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function meta() {
  return [{ title: "Billing & Subscription - Staffora Client Portal" }];
}

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = (await portalApi.billing.get()) as {
          data: BillingOverview;
        };
        if (!cancelled) setBilling(res.data);
      } catch {
        if (!cancelled) setError("Failed to load billing information.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 rounded bg-gray-200" />
        <div className="h-48 rounded-2xl bg-gray-200" />
        <div className="h-64 rounded-2xl bg-gray-200" />
        <div className="h-48 rounded-2xl bg-gray-200" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
        {error}
        <button
          onClick={() => window.location.reload()}
          className="ml-2 font-medium underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!billing) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Billing & Subscription
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your subscription, view modules, and download invoices.
        </p>
      </div>

      {/* Current Plan Card */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50">
              <Package className="h-6 w-6 text-brand-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900">
                  {billing.plan.name}
                </h2>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    STATUS_COLORS[billing.plan.status] || "bg-gray-100 text-gray-600",
                  )}
                >
                  {billing.plan.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                Current period: {formatDate(billing.plan.currentPeriodStart)} --{" "}
                {formatDate(billing.plan.currentPeriodEnd)}
              </p>
              <p className="mt-0.5 text-sm text-gray-500">
                Next renewal: {formatDate(billing.plan.nextRenewalDate)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <RefreshCw className="h-4 w-4" />
            Auto-renew:{" "}
            <span className="font-medium text-gray-900">
              {billing.plan.autoRenew ? "Enabled" : "Disabled"}
            </span>
          </div>
        </div>
      </div>

      {/* Active Modules */}
      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            Active Modules
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="px-5 py-3 font-semibold text-gray-600">Module</th>
                <th className="px-5 py-3 font-semibold text-gray-600">Description</th>
                <th className="px-5 py-3 font-semibold text-gray-600 text-right">Monthly</th>
                <th className="px-5 py-3 font-semibold text-gray-600 text-right">Annual</th>
                <th className="px-5 py-3 font-semibold text-gray-600 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {billing.modules.map((mod) => (
                <tr key={mod.name} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900">
                    {mod.name}
                  </td>
                  <td className="px-5 py-3 text-gray-500">{mod.description}</td>
                  <td className="px-5 py-3 text-right text-gray-700">
                    {formatCurrency(mod.monthlyPrice)}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-700">
                    {formatCurrency(mod.annualPrice)}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {mod.isEnabled ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                        <CheckCircle className="h-3 w-3" />
                        Enabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                        <XCircle className="h-3 w-3" />
                        Disabled
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Current Month Breakdown */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Current Month Breakdown
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Base plan</span>
              <span className="font-medium text-gray-900">
                {formatCurrency(billing.breakdown.basePlan)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Modules total</span>
              <span className="font-medium text-gray-900">
                {formatCurrency(billing.breakdown.moduleTotal)}
              </span>
            </div>
            <div className="border-t border-gray-100 pt-3 flex items-center justify-between text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-medium text-gray-900">
                {formatCurrency(billing.breakdown.subtotal)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">
                VAT ({billing.breakdown.vatRate}%)
              </span>
              <span className="font-medium text-gray-900">
                {formatCurrency(billing.breakdown.vatAmount)}
              </span>
            </div>
            <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
              <span className="text-base font-bold text-gray-900">Total</span>
              <span className="text-xl font-bold text-gray-900">
                {formatCurrency(billing.breakdown.total)}
              </span>
            </div>
          </div>
        </div>

        {/* Payment Method */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Payment Method
          </h2>
          {billing.paymentMethod ? (
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50">
                {billing.paymentMethod.type === "card" ? (
                  <CreditCard className="h-6 w-6 text-gray-500" />
                ) : (
                  <Banknote className="h-6 w-6 text-gray-500" />
                )}
              </div>
              <div>
                {billing.paymentMethod.type === "card" ? (
                  <>
                    <p className="font-medium text-gray-900">
                      {billing.paymentMethod.cardBrand || "Card"} ending in{" "}
                      {billing.paymentMethod.last4}
                    </p>
                    <p className="text-sm text-gray-500">
                      Expires {billing.paymentMethod.expiry}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-gray-900">Bank Transfer</p>
                    <p className="text-sm text-gray-500">
                      {billing.paymentMethod.bankName} -- Account ending{" "}
                      {billing.paymentMethod.last4}
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              No payment method on file.
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/portal/billing/invoices"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <FileText className="h-4 w-4" />
              View Invoices
            </Link>
            <button
              disabled
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-400 cursor-not-allowed"
              title="Coming soon"
            >
              <CreditCard className="h-4 w-4" />
              Update Payment Method
            </button>
          </div>
        </div>
      </div>

      {/* Recent Invoices */}
      {billing.recentInvoices.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">
              Recent Invoices
            </h2>
            <Link
              to="/portal/billing/invoices"
              className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 transition"
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {billing.recentInvoices.map((inv) => (
              <Link
                key={inv.id}
                to={`/portal/billing/invoices/${inv.id}`}
                className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-gray-50"
              >
                <FileText className="h-5 w-5 text-gray-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {inv.number}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(inv.date)}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    INVOICE_STATUS_COLORS[inv.status] || "bg-gray-100 text-gray-600",
                  )}
                >
                  {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  {formatCurrency(inv.amount)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
