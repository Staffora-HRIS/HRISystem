/**
 * Succession Plan Card Component
 *
 * Displays a succession plan with candidates and readiness levels.
 */

import { Users, AlertTriangle, CheckCircle, Clock, TrendingUp } from "lucide-react";
import { cn } from "~/lib/utils";

interface Candidate {
  id: string;
  employee_id: string;
  employee_name: string;
  readiness_level: "ready_now" | "ready_1_year" | "ready_2_years" | "development_needed";
  priority: number;
  development_notes: string | null;
}

interface SuccessionPlan {
  id: string;
  position_id: string;
  position_title: string;
  department_name?: string;
  criticality: "critical" | "high" | "medium" | "low";
  risk_level: "high" | "medium" | "low";
  status: "active" | "draft" | "archived";
  candidates: Candidate[];
  created_at: string;
  updated_at: string;
}

interface SuccessionPlanCardProps {
  plan: SuccessionPlan;
  onViewDetails?: (planId: string) => void;
  onAddCandidate?: (planId: string) => void;
  className?: string;
}

function getCriticalityColor(criticality: string): string {
  const colors: Record<string, string> = {
    critical: "bg-red-100 text-red-700 border-red-200",
    high: "bg-orange-100 text-orange-700 border-orange-200",
    medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
    low: "bg-gray-100 text-gray-700 border-gray-200",
  };
  return colors[criticality] || colors.medium;
}

function getRiskIcon(riskLevel: string) {
  switch (riskLevel) {
    case "high":
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    case "medium":
      return <Clock className="h-4 w-4 text-yellow-500" />;
    case "low":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    default:
      return null;
  }
}

function getReadinessColor(level: string): string {
  const colors: Record<string, string> = {
    ready_now: "bg-green-100 text-green-700",
    ready_1_year: "bg-blue-100 text-blue-700",
    ready_2_years: "bg-yellow-100 text-yellow-700",
    development_needed: "bg-orange-100 text-orange-700",
  };
  return colors[level] || "bg-gray-100 text-gray-700";
}

function getReadinessLabel(level: string): string {
  const labels: Record<string, string> = {
    ready_now: "Ready Now",
    ready_1_year: "Ready in 1 Year",
    ready_2_years: "Ready in 2 Years",
    development_needed: "Development Needed",
  };
  return labels[level] || level;
}

export function SuccessionPlanCard({
  plan,
  onViewDetails,
  onAddCandidate,
  className,
}: SuccessionPlanCardProps) {
  const readyNowCount = plan.candidates.filter(
    (c) => c.readiness_level === "ready_now"
  ).length;
  const readySoonCount = plan.candidates.filter(
    (c) =>
      c.readiness_level === "ready_1_year" ||
      c.readiness_level === "ready_2_years"
  ).length;

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
                getCriticalityColor(plan.criticality)
              )}
            >
              {plan.criticality}
            </span>
            <div className="flex items-center gap-1">
              {getRiskIcon(plan.risk_level)}
              <span className="text-xs text-gray-500 capitalize">
                {plan.risk_level} Risk
              </span>
            </div>
          </div>
          <h3 className="mt-2 text-lg font-semibold text-gray-900">
            {plan.position_title}
          </h3>
          {plan.department_name && (
            <p className="mt-1 text-sm text-gray-500">{plan.department_name}</p>
          )}
        </div>
      </div>

      {/* Candidate Summary */}
      <div className="mt-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-600">
            {plan.candidates.length} Candidate{plan.candidates.length !== 1 ? "s" : ""}
          </span>
        </div>
        {readyNowCount > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            <TrendingUp className="h-3 w-3" />
            {readyNowCount} Ready Now
          </span>
        )}
        {readySoonCount > 0 && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            {readySoonCount} Ready Soon
          </span>
        )}
      </div>

      {/* Candidates Preview */}
      {plan.candidates.length > 0 && (
        <div className="mt-4 space-y-2">
          {plan.candidates.slice(0, 3).map((candidate, index) => (
            <div
              key={candidate.id}
              className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                  {index + 1}
                </span>
                <span className="text-sm font-medium text-gray-700">
                  {candidate.employee_name}
                </span>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  getReadinessColor(candidate.readiness_level)
                )}
              >
                {getReadinessLabel(candidate.readiness_level)}
              </span>
            </div>
          ))}
          {plan.candidates.length > 3 && (
            <p className="text-center text-xs text-gray-500">
              +{plan.candidates.length - 3} more candidate
              {plan.candidates.length - 3 !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}

      {/* No Candidates Warning */}
      {plan.candidates.length === 0 && (
        <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
          <div className="flex items-center gap-2 text-sm text-yellow-700">
            <AlertTriangle className="h-4 w-4" />
            <span>No successors identified for this position.</span>
          </div>
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
        {onAddCandidate && (
          <button
            onClick={() => onAddCandidate(plan.id)}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add Candidate
          </button>
        )}
      </div>
    </div>
  );
}

export default SuccessionPlanCard;
