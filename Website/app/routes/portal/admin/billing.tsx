import { useState, useEffect } from "react";
import { Link } from "react-router";
import {
  TrendingUp,
  Users,
  CreditCard,
  AlertTriangle,
  Calendar,
  Send,
  FileText,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi } from "~/lib/portal-api";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface AdminBillingData {
  revenue: {
    mrr: number;
    arr: number;
    activeLicenses: number;
    trialLicenses: number;
  };
  upcomingRenewals: {
    tenantName: string;
    planName: string;
    renewalDate: string;
    amount: number;
  }[];
  overdueInvoices: {
    id: string;
    tenantName: string;
    invoiceNumber: string;
    amount: number;
    dueDate: string;
    daysOverdue: number;
  }[];
  modulePopularity: {
    name: string;
    count: number;
    percentage: number;
  }[];
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatCurrency(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(pence / 100);
}

function formatDate(dateStr: string): string {
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
  return [{ title: "Billing Management - Staffora Client Portal" }];
}

export default function AdminBillingPage() {
  const [data, setData] = useState<AdminBillingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = (await portalApi.billing.get()) as {
          data: AdminBillingData;
        };
        if (!cancelled) setData(res.data);
      } catch {
        if (!cancelled) setError("Failed to load billing data.");
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
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-gray-200" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-gray-200" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        role="alert"
      >
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

  if (!data) return null;

  const revenueCards = [
    {
      label: "Monthly Recurring Revenue",
      value: formatCurrency(data.revenue.mrr),
      icon: TrendingUp,
      color: "bg-brand-50 text-brand-600",
    },
    {
      label: "Annual Recurring Revenue",
      value: formatCurrency(data.revenue.arr),
      icon: CreditCard,
      color: "bg-green-50 text-green-600",
    },
    {
      label: "Active Licences",
      value: String(data.revenue.activeLicenses),
      icon: Users,
      color: "bg-purple-50 text-purple-600",
    },
    {
      label: "Trial Licences",
      value: String(data.revenue.trialLicenses),
      icon: Calendar,
      color: "bg-amber-50 text-amber-600",
    },
  ];

  const maxModuleCount = Math.max(
    ...data.modulePopularity.map((m) => m.count),
    1,
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Toast */}
      {toast && (
        <div className="fixed right-4 top-4 z-50 rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-medium text-green-700 shadow-lg animate-fade-in-down">
          {toast}
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Billing Management
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Revenue overview, renewals, and invoice management.
        </p>
      </div>

      {/* Revenue Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {revenueCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-2xl border border-gray-200 bg-white p-5"
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl",
                    card.color,
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">
                    {card.label}
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {card.value}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming Renewals */}
        <div className="rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">
              Upcoming Renewals (Next 30 Days)
            </h2>
          </div>
          {data.upcomingRenewals.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              No upcoming renewals.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {data.upcomingRenewals.map((renewal, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {renewal.tenantName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {renewal.planName} -- Renews{" "}
                      {formatDate(renewal.renewalDate)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">
                    {formatCurrency(renewal.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Overdue Invoices */}
        <div className="rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">
              Overdue Invoices
            </h2>
          </div>
          {data.overdueInvoices.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              No overdue invoices.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {data.overdueInvoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {inv.tenantName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {inv.invoiceNumber} -- Due{" "}
                      {formatDate(inv.dueDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-red-600">
                      {formatCurrency(inv.amount)}
                    </p>
                    <p className="text-xs text-red-500">
                      {inv.daysOverdue} days overdue
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => {
              setToast("Invoice generation queued");
              setTimeout(() => setToast(null), 3000);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <FileText className="h-4 w-4" />
            Generate Invoices
          </button>
          <button
            onClick={() => {
              setToast("Reminders sent");
              setTimeout(() => setToast(null), 3000);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <Send className="h-4 w-4" />
            Send Reminders
          </button>
        </div>
      </div>

      {/* Module Popularity */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-6">
          Module Popularity
        </h2>
        <div className="space-y-3">
          {data.modulePopularity.map((mod) => (
            <div key={mod.name} className="flex items-center gap-4">
              <span className="w-32 text-sm font-medium text-gray-700 truncate">
                {mod.name}
              </span>
              <div className="flex-1 h-6 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-brand transition-all duration-500"
                  style={{
                    width: `${(mod.count / maxModuleCount) * 100}%`,
                  }}
                />
              </div>
              <span className="w-10 text-right text-sm font-semibold text-gray-900">
                {mod.count}
              </span>
              <span className="w-12 text-right text-xs text-gray-400">
                {mod.percentage}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
