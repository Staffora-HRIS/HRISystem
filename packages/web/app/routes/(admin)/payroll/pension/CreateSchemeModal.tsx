/**
 * Create Pension Scheme Modal
 *
 * Form modal for creating a new pension scheme with name, provider,
 * scheme type, contribution percentages, qualifying earnings limits,
 * and default scheme toggle.
 */

import { useState } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from "~/components/ui";
import { useToast } from "~/components/ui/toast";
import type { CreateSchemeForm } from "./types";
import { initialSchemeForm } from "./types";

interface CreateSchemeModalProps {
  isPending: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
  onClose: () => void;
}

export function CreateSchemeModal({
  isPending,
  onSubmit,
  onClose,
}: CreateSchemeModalProps) {
  const toast = useToast();
  const [form, setForm] = useState<CreateSchemeForm>(initialSchemeForm);

  function handleSubmit() {
    if (!form.name.trim()) {
      toast.error("Scheme name is required");
      return;
    }
    if (!form.provider.trim()) {
      toast.error("Provider is required");
      return;
    }

    const employerPct = Number(form.employer_contribution_pct);
    const employeePct = Number(form.employee_contribution_pct);

    if (Number.isNaN(employerPct) || employerPct < 3) {
      toast.error("Employer contribution must be at least 3%");
      return;
    }
    if (Number.isNaN(employeePct) || employeePct < 0) {
      toast.error("Employee contribution must be 0% or more");
      return;
    }

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      provider: form.provider.trim(),
      scheme_type: form.scheme_type,
      employer_contribution_pct: employerPct,
      employee_contribution_pct: employeePct,
      is_default: form.is_default,
    };

    if (form.qualifying_earnings_lower) {
      payload.qualifying_earnings_lower = Number(
        form.qualifying_earnings_lower
      );
    }
    if (form.qualifying_earnings_upper) {
      payload.qualifying_earnings_upper = Number(
        form.qualifying_earnings_upper
      );
    }

    onSubmit(payload);
  }

  function handleClose() {
    if (!isPending) {
      onClose();
    }
  }

  return (
    <Modal open onClose={handleClose} size="lg">
      <ModalHeader>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Create Pension Scheme
        </h3>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="scheme-name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Scheme Name <span className="text-red-500">*</span>
            </label>
            <input
              id="scheme-name"
              type="text"
              placeholder="e.g. Standard Workplace Pension"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div>
            <label
              htmlFor="scheme-provider"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Provider <span className="text-red-500">*</span>
            </label>
            <input
              id="scheme-provider"
              type="text"
              placeholder="e.g. NEST, The People's Pension"
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div>
            <label
              htmlFor="scheme-type"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Scheme Type
            </label>
            <select
              id="scheme-type"
              value={form.scheme_type}
              onChange={(e) =>
                setForm({
                  ...form,
                  scheme_type: e.target.value as CreateSchemeForm["scheme_type"],
                })
              }
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            >
              <option value="defined_contribution">
                Defined Contribution
              </option>
              <option value="master_trust">Master Trust</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="employer-pct"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Employer Contribution (%)
                <span className="text-red-500"> *</span>
              </label>
              <input
                id="employer-pct"
                type="number"
                min={3}
                step="0.1"
                placeholder="3"
                value={form.employer_contribution_pct}
                onChange={(e) =>
                  setForm({
                    ...form,
                    employer_contribution_pct: e.target.value,
                  })
                }
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Statutory minimum: 3%
              </p>
            </div>
            <div>
              <label
                htmlFor="employee-pct"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Employee Contribution (%)
                <span className="text-red-500"> *</span>
              </label>
              <input
                id="employee-pct"
                type="number"
                min={0}
                step="0.1"
                placeholder="5"
                value={form.employee_contribution_pct}
                onChange={(e) =>
                  setForm({
                    ...form,
                    employee_contribution_pct: e.target.value,
                  })
                }
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Total minimum (employer + employee): 8%
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="qe-lower"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                QE Lower Limit (pence)
              </label>
              <input
                id="qe-lower"
                type="number"
                min={0}
                placeholder="624000"
                value={form.qualifying_earnings_lower}
                onChange={(e) =>
                  setForm({
                    ...form,
                    qualifying_earnings_lower: e.target.value,
                  })
                }
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Default: 624000 (£6,240)
              </p>
            </div>
            <div>
              <label
                htmlFor="qe-upper"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                QE Upper Limit (pence)
              </label>
              <input
                id="qe-upper"
                type="number"
                min={1}
                placeholder="5027000"
                value={form.qualifying_earnings_upper}
                onChange={(e) =>
                  setForm({
                    ...form,
                    qualifying_earnings_upper: e.target.value,
                  })
                }
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Default: 5027000 (£50,270)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="is-default"
              type="checkbox"
              checked={form.is_default}
              onChange={(e) =>
                setForm({ ...form, is_default: e.target.checked })
              }
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <label
              htmlFor="is-default"
              className="text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Set as default scheme for auto-enrolment
            </label>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={handleClose} disabled={isPending}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={
            !form.name.trim() ||
            !form.provider.trim() ||
            !form.employer_contribution_pct ||
            !form.employee_contribution_pct ||
            isPending
          }
        >
          {isPending ? "Creating..." : "Create Scheme"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
