/**
 * Benefit Plan Card Component
 *
 * Displays a benefit plan with enrollment status and actions.
 */

import { Check, X, Clock, DollarSign, Users, Calendar } from "lucide-react";
import { cn } from "~/lib/utils";

interface BenefitPlan {
  id: string;
  planType: string;
  name: string;
  description: string | null;
  provider: string | null;
  coverageLevel: string;
  employeeContribution: number;
  employerContribution: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  enrollmentStart: string | null;
  enrollmentEnd: string | null;
  isActive: boolean;
  enrollmentStatus?: "enrolled" | "pending" | "not_enrolled" | "waived";
}

interface PlanCardProps {
  plan: BenefitPlan;
  onEnroll?: (planId: string) => void;
  onWaive?: (planId: string) => void;
  onViewDetails?: (planId: string) => void;
  className?: string;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function getPlanTypeColor(planType: string): string {
  const colors: Record<string, string> = {
    medical: "bg-blue-100 text-blue-700 border-blue-200",
    dental: "bg-cyan-100 text-cyan-700 border-cyan-200",
    vision: "bg-purple-100 text-purple-700 border-purple-200",
    life: "bg-green-100 text-green-700 border-green-200",
    disability: "bg-orange-100 text-orange-700 border-orange-200",
    retirement: "bg-yellow-100 text-yellow-700 border-yellow-200",
    hsa: "bg-teal-100 text-teal-700 border-teal-200",
    fsa: "bg-indigo-100 text-indigo-700 border-indigo-200",
    other: "bg-gray-100 text-gray-700 border-gray-200",
  };
  return colors[planType] || colors.other;
}

function getEnrollmentStatusBadge(status?: string) {
  switch (status) {
    case "enrolled":
      return (
        <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
          <Check className="h-3 w-3" />
          Enrolled
        </span>
      );
    case "pending":
      return (
        <span className="flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
          <Clock className="h-3 w-3" />
          Pending
        </span>
      );
    case "waived":
      return (
        <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
          <X className="h-3 w-3" />
          Waived
        </span>
      );
    default:
      return null;
  }
}

export function PlanCard({
  plan,
  onEnroll,
  onWaive,
  onViewDetails,
  className,
}: PlanCardProps) {
  const isEnrollmentOpen =
    plan.enrollmentStart &&
    plan.enrollmentEnd &&
    new Date() >= new Date(plan.enrollmentStart) &&
    new Date() <= new Date(plan.enrollmentEnd);

  const totalCost = plan.employeeContribution + plan.employerContribution;
  const employerPercentage =
    totalCost > 0 ? (plan.employerContribution / totalCost) * 100 : 0;

  return (
    <div
      className={cn(
        "rounded-lg border bg-white p-6 shadow-sm transition-shadow hover:shadow-md",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
                getPlanTypeColor(plan.planType)
              )}
            >
              {plan.planType}
            </span>
            {getEnrollmentStatusBadge(plan.enrollmentStatus)}
          </div>
          <h3 className="mt-2 text-lg font-semibold text-gray-900">
            {plan.name}
          </h3>
          {plan.provider && (
            <p className="mt-1 text-sm text-gray-500">{plan.provider}</p>
          )}
        </div>
      </div>

      {/* Description */}
      {plan.description && (
        <p className="mt-3 text-sm text-gray-600 line-clamp-2">
          {plan.description}
        </p>
      )}

      {/* Coverage & Cost */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded-lg bg-gray-50 p-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Users className="h-4 w-4" />
            Coverage
          </div>
          <p className="mt-1 font-medium capitalize text-gray-900">
            {plan.coverageLevel.replace("_", " + ")}
          </p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <DollarSign className="h-4 w-4" />
            Your Cost
          </div>
          <p className="mt-1 font-medium text-gray-900">
            {formatCurrency(plan.employeeContribution)}
            <span className="text-xs text-gray-500">/mo</span>
          </p>
        </div>
      </div>

      {/* Employer Contribution Bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Employer pays {employerPercentage.toFixed(0)}%</span>
          <span>{formatCurrency(plan.employerContribution)}/mo</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-green-500 transition-all"
            style={{ width: `${employerPercentage}%` }}
          />
        </div>
      </div>

      {/* Enrollment Period */}
      {plan.enrollmentStart && plan.enrollmentEnd && (
        <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
          <Calendar className="h-4 w-4" />
          <span>
            Enrollment:{" "}
            {new Date(plan.enrollmentStart).toLocaleDateString()} -{" "}
            {new Date(plan.enrollmentEnd).toLocaleDateString()}
          </span>
          {isEnrollmentOpen && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              Open
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2">
        {onViewDetails && (
          <button
            onClick={() => onViewDetails(plan.id)}
            className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            View Details
          </button>
        )}
        {plan.enrollmentStatus !== "enrolled" &&
          plan.enrollmentStatus !== "pending" &&
          isEnrollmentOpen &&
          onEnroll && (
            <button
              onClick={() => onEnroll(plan.id)}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Enroll Now
            </button>
          )}
        {plan.enrollmentStatus !== "waived" &&
          plan.enrollmentStatus !== "enrolled" &&
          isEnrollmentOpen &&
          onWaive && (
            <button
              onClick={() => onWaive(plan.id)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50"
            >
              Waive
            </button>
          )}
      </div>
    </div>
  );
}

export default PlanCard;
