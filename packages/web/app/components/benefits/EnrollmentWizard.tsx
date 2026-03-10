/**
 * Benefits Enrollment Wizard Component
 *
 * Multi-step wizard for enrolling in benefit plans.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  AlertCircle,
  User,
  Users,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { api } from "~/lib/api-client";

interface BenefitPlan {
  id: string;
  planType: string;
  name: string;
  description: string | null;
  provider: string | null;
  coverageLevel: string;
  employeeContribution: number;
  employerContribution: number;
}

interface Dependent {
  id?: string;
  firstName: string;
  lastName: string;
  relationship: string;
  dateOfBirth: string;
  ssnLastFour?: string;
}

interface EnrollmentWizardProps {
  plan: BenefitPlan;
  onComplete: () => void;
  onCancel: () => void;
  className?: string;
}

type Step = "coverage" | "dependents" | "beneficiaries" | "review" | "confirm";

const STEPS: { id: Step; label: string }[] = [
  { id: "coverage", label: "Coverage" },
  { id: "dependents", label: "Dependents" },
  { id: "beneficiaries", label: "Beneficiaries" },
  { id: "review", label: "Review" },
  { id: "confirm", label: "Confirm" },
];

const COVERAGE_LEVELS = [
  { value: "employee_only", label: "Employee Only", icon: User },
  { value: "employee_spouse", label: "Employee + Spouse", icon: Users },
  { value: "employee_children", label: "Employee + Children", icon: Users },
  { value: "family", label: "Family", icon: Users },
];

const RELATIONSHIPS = [
  { value: "spouse", label: "Spouse" },
  { value: "child", label: "Child" },
  { value: "domestic_partner", label: "Domestic Partner" },
  { value: "other", label: "Other" },
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function EnrollmentWizard({
  plan,
  onComplete,
  onCancel,
  className,
}: EnrollmentWizardProps) {
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState<Step>("coverage");
  const [coverageLevel, setCoverageLevel] = useState(plan.coverageLevel);
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<
    { name: string; relationship: string; percentage: number }[]
  >([]);
  const [acknowledgements, setAcknowledgements] = useState({
    terms: false,
    accuracy: false,
    authorization: false,
  });

  const enrollMutation = useMutation({
    mutationFn: async () => {
      return api.post("/benefits/enrollments", {
        planId: plan.id,
        coverageLevel,
        dependents: dependents.length > 0 ? dependents : undefined,
        beneficiaries: beneficiaries.length > 0 ? beneficiaries : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["benefits"] });
      queryClient.invalidateQueries({ queryKey: ["enrollments"] });
      onComplete();
    },
  });

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === STEPS.length - 1;

  const goNext = () => {
    if (!isLastStep) {
      setCurrentStep(STEPS[currentStepIndex + 1].id);
    }
  };

  const goPrev = () => {
    if (!isFirstStep) {
      setCurrentStep(STEPS[currentStepIndex - 1].id);
    }
  };

  const addDependent = () => {
    setDependents([
      ...dependents,
      { firstName: "", lastName: "", relationship: "child", dateOfBirth: "" },
    ]);
  };

  const updateDependent = (index: number, field: keyof Dependent, value: string) => {
    const updated = [...dependents];
    updated[index] = { ...updated[index], [field]: value };
    setDependents(updated);
  };

  const removeDependent = (index: number) => {
    setDependents(dependents.filter((_, i) => i !== index));
  };

  const addBeneficiary = () => {
    setBeneficiaries([
      ...beneficiaries,
      { name: "", relationship: "", percentage: 0 },
    ]);
  };

  const updateBeneficiary = (
    index: number,
    field: keyof (typeof beneficiaries)[0],
    value: string | number
  ) => {
    const updated = [...beneficiaries];
    updated[index] = { ...updated[index], [field]: value };
    setBeneficiaries(updated);
  };

  const removeBeneficiary = (index: number) => {
    setBeneficiaries(beneficiaries.filter((_, i) => i !== index));
  };

  const canProceed = () => {
    switch (currentStep) {
      case "coverage":
        return !!coverageLevel;
      case "dependents":
        return dependents.every(
          (d) => d.firstName && d.lastName && d.relationship && d.dateOfBirth
        );
      case "beneficiaries":
        if (beneficiaries.length === 0) return true;
        const totalPercentage = beneficiaries.reduce(
          (sum, b) => sum + b.percentage,
          0
        );
        return (
          beneficiaries.every((b) => b.name && b.percentage > 0) &&
          totalPercentage === 100
        );
      case "review":
        return true;
      case "confirm":
        return Object.values(acknowledgements).every(Boolean);
      default:
        return true;
    }
  };

  const handleSubmit = () => {
    if (canProceed() && isLastStep) {
      enrollMutation.mutate();
    }
  };

  return (
    <div className={cn("rounded-lg border bg-white shadow-lg", className)}>
      {/* Header */}
      <div className="border-b px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Enroll in {plan.name}
        </h2>
        <p className="mt-1 text-sm text-gray-500">{plan.provider}</p>
      </div>

      {/* Progress Steps */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => {
            const isActive = step.id === currentStep;
            const isComplete = index < currentStepIndex;

            return (
              <div key={step.id} className="flex items-center">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
                    isActive && "bg-blue-600 text-white",
                    isComplete && "bg-green-500 text-white",
                    !isActive && !isComplete && "bg-gray-200 text-gray-500"
                  )}
                >
                  {isComplete ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                <span
                  className={cn(
                    "ml-2 text-sm font-medium",
                    isActive && "text-blue-600",
                    isComplete && "text-green-600",
                    !isActive && !isComplete && "text-gray-500"
                  )}
                >
                  {step.label}
                </span>
                {index < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "mx-4 h-0.5 w-12",
                      isComplete ? "bg-green-500" : "bg-gray-200"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="p-6">
        {/* Coverage Step */}
        {currentStep === "coverage" && (
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900">Select Coverage Level</h3>
            <div className="grid grid-cols-2 gap-4">
              {COVERAGE_LEVELS.map((level) => {
                const Icon = level.icon;
                return (
                  <button
                    key={level.value}
                    onClick={() => setCoverageLevel(level.value)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-4 text-left transition-colors",
                      coverageLevel === level.value
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-6 w-6",
                        coverageLevel === level.value
                          ? "text-blue-600"
                          : "text-gray-400"
                      )}
                    />
                    <span
                      className={cn(
                        "font-medium",
                        coverageLevel === level.value
                          ? "text-blue-900"
                          : "text-gray-700"
                      )}
                    >
                      {level.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Dependents Step */}
        {currentStep === "dependents" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900">Add Dependents</h3>
              <button
                onClick={addDependent}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                + Add Dependent
              </button>
            </div>

            {dependents.length === 0 ? (
              <p className="py-8 text-center text-gray-500">
                No dependents added. Click "Add Dependent" to add family members.
              </p>
            ) : (
              <div className="space-y-4">
                {dependents.map((dep, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-gray-200 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">
                        Dependent {index + 1}
                      </span>
                      <button
                        onClick={() => removeDependent(index)}
                        className="text-sm text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-4">
                      <input
                        type="text"
                        placeholder="First Name"
                        value={dep.firstName}
                        onChange={(e) =>
                          updateDependent(index, "firstName", e.target.value)
                        }
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Last Name"
                        value={dep.lastName}
                        onChange={(e) =>
                          updateDependent(index, "lastName", e.target.value)
                        }
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                      <select
                        value={dep.relationship}
                        onChange={(e) =>
                          updateDependent(index, "relationship", e.target.value)
                        }
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      >
                        {RELATIONSHIPS.map((rel) => (
                          <option key={rel.value} value={rel.value}>
                            {rel.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        placeholder="Date of Birth"
                        value={dep.dateOfBirth}
                        onChange={(e) =>
                          updateDependent(index, "dateOfBirth", e.target.value)
                        }
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Beneficiaries Step */}
        {currentStep === "beneficiaries" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900">Add Beneficiaries</h3>
              <button
                onClick={addBeneficiary}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                + Add Beneficiary
              </button>
            </div>

            {beneficiaries.length === 0 ? (
              <p className="py-8 text-center text-gray-500">
                No beneficiaries added. This is optional for most plans.
              </p>
            ) : (
              <div className="space-y-4">
                {beneficiaries.map((ben, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-gray-200 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">
                        Beneficiary {index + 1}
                      </span>
                      <button
                        onClick={() => removeBeneficiary(index)}
                        className="text-sm text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-4">
                      <input
                        type="text"
                        placeholder="Full Name"
                        value={ben.name}
                        onChange={(e) =>
                          updateBeneficiary(index, "name", e.target.value)
                        }
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Relationship"
                        value={ben.relationship}
                        onChange={(e) =>
                          updateBeneficiary(index, "relationship", e.target.value)
                        }
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder="%"
                          min="0"
                          max="100"
                          value={ben.percentage || ""}
                          onChange={(e) =>
                            updateBeneficiary(
                              index,
                              "percentage",
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        />
                        <span className="text-sm text-gray-500">%</span>
                      </div>
                    </div>
                  </div>
                ))}
                {beneficiaries.length > 0 && (
                  <div className="flex items-center justify-end gap-2 text-sm">
                    <span className="text-gray-500">Total:</span>
                    <span
                      className={cn(
                        "font-medium",
                        beneficiaries.reduce((sum, b) => sum + b.percentage, 0) ===
                          100
                          ? "text-green-600"
                          : "text-red-600"
                      )}
                    >
                      {beneficiaries.reduce((sum, b) => sum + b.percentage, 0)}%
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Review Step */}
        {currentStep === "review" && (
          <div className="space-y-6">
            <h3 className="font-medium text-gray-900">Review Your Selections</h3>

            <div className="rounded-lg bg-gray-50 p-4">
              <h4 className="text-sm font-medium text-gray-700">Plan</h4>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {plan.name}
              </p>
              <p className="text-sm text-gray-500">{plan.provider}</p>
            </div>

            <div className="rounded-lg bg-gray-50 p-4">
              <h4 className="text-sm font-medium text-gray-700">Coverage</h4>
              <p className="mt-1 font-medium capitalize text-gray-900">
                {coverageLevel.replace(/_/g, " ")}
              </p>
            </div>

            <div className="rounded-lg bg-gray-50 p-4">
              <h4 className="text-sm font-medium text-gray-700">Monthly Cost</h4>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Your Contribution</span>
                  <span className="font-medium">
                    {formatCurrency(plan.employeeContribution)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Employer Contribution</span>
                  <span className="font-medium text-green-600">
                    {formatCurrency(plan.employerContribution)}
                  </span>
                </div>
              </div>
            </div>

            {dependents.length > 0 && (
              <div className="rounded-lg bg-gray-50 p-4">
                <h4 className="text-sm font-medium text-gray-700">
                  Dependents ({dependents.length})
                </h4>
                <ul className="mt-2 space-y-1">
                  {dependents.map((dep, index) => (
                    <li key={index} className="text-sm text-gray-600">
                      {dep.firstName} {dep.lastName} ({dep.relationship})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {beneficiaries.length > 0 && (
              <div className="rounded-lg bg-gray-50 p-4">
                <h4 className="text-sm font-medium text-gray-700">
                  Beneficiaries ({beneficiaries.length})
                </h4>
                <ul className="mt-2 space-y-1">
                  {beneficiaries.map((ben, index) => (
                    <li key={index} className="text-sm text-gray-600">
                      {ben.name} ({ben.relationship}) - {ben.percentage}%
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Confirm Step */}
        {currentStep === "confirm" && (
          <div className="space-y-6">
            <h3 className="font-medium text-gray-900">Confirm & Submit</h3>

            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                <div className="text-sm text-yellow-700">
                  <p className="font-medium">Important</p>
                  <p className="mt-1">
                    Please review and acknowledge the following before
                    submitting your enrollment.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={acknowledgements.terms}
                  onChange={(e) =>
                    setAcknowledgements({
                      ...acknowledgements,
                      terms: e.target.checked,
                    })
                  }
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm text-gray-600">
                  I have read and agree to the plan terms and conditions.
                </span>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={acknowledgements.accuracy}
                  onChange={(e) =>
                    setAcknowledgements({
                      ...acknowledgements,
                      accuracy: e.target.checked,
                    })
                  }
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm text-gray-600">
                  I certify that all information provided is accurate and
                  complete to the best of my knowledge.
                </span>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={acknowledgements.authorization}
                  onChange={(e) =>
                    setAcknowledgements({
                      ...acknowledgements,
                      authorization: e.target.checked,
                    })
                  }
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm text-gray-600">
                  I authorize deductions from my paycheck for the selected
                  coverage.
                </span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t px-6 py-4">
        <button
          onClick={onCancel}
          className="text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>

        <div className="flex items-center gap-3">
          {!isFirstStep && (
            <button
              onClick={goPrev}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          )}

          {isLastStep ? (
            <button
              onClick={handleSubmit}
              disabled={!canProceed() || enrollMutation.isPending}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white",
                canProceed() && !enrollMutation.isPending
                  ? "bg-green-600 hover:bg-green-700"
                  : "cursor-not-allowed bg-gray-300"
              )}
            >
              {enrollMutation.isPending ? (
                "Submitting..."
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Submit Enrollment
                </>
              )}
            </button>
          ) : (
            <button
              onClick={goNext}
              disabled={!canProceed()}
              className={cn(
                "flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium text-white",
                canProceed()
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "cursor-not-allowed bg-gray-300"
              )}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Error Display */}
      {enrollMutation.isError && (
        <div className="border-t bg-red-50 px-6 py-3">
          <p className="text-sm text-red-600">
            Failed to submit enrollment. Please try again.
          </p>
        </div>
      )}
    </div>
  );
}

export default EnrollmentWizard;
