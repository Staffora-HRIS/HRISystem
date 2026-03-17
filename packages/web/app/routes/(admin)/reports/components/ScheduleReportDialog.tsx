/**
 * ScheduleReportDialog Component
 *
 * Modal dialog for configuring automated report delivery schedules.
 * Supports daily, weekly, fortnightly, monthly, quarterly, and annually frequencies.
 * Recipients are specified by email address. Export format can be CSV, Excel, or PDF.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Select,
} from "~/components/ui";
import { Calendar, Clock, Mail, Plus, Trash2, AlertCircle } from "lucide-react";
import type {
  ScheduleFrequency,
  ScheduleRecipient,
  ScheduleExportFormat,
  ReportDefinition,
} from "../types";

// ============================================================================
// Types
// ============================================================================

interface ScheduleFormData {
  frequency: ScheduleFrequency;
  time: string;
  dayOfWeek: number;
  dayOfMonth: number;
  recipients: ScheduleRecipient[];
  exportFormat: ScheduleExportFormat;
}

interface ScheduleReportDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    frequency: ScheduleFrequency;
    time?: string;
    day_of_week?: number;
    day_of_month?: number;
    recipients: ScheduleRecipient[];
    export_format?: ScheduleExportFormat;
  }) => Promise<void>;
  onRemove?: () => Promise<void>;
  /** Current report definition, used to pre-populate schedule fields if already scheduled */
  report: ReportDefinition;
  loading?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const FREQUENCY_OPTIONS: { value: ScheduleFrequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" },
];

const DAY_OF_WEEK_OPTIONS: { value: string; label: string }[] = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "0", label: "Sunday" },
];

const FORMAT_OPTIONS: { value: ScheduleExportFormat; label: string }[] = [
  { value: "csv", label: "CSV" },
  { value: "xlsx", label: "Excel (XLSX)" },
  { value: "pdf", label: "PDF" },
];

// Email validation pattern
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ============================================================================
// Component
// ============================================================================

export function ScheduleReportDialog({
  open,
  onClose,
  onSave,
  onRemove,
  report,
  loading = false,
}: ScheduleReportDialogProps) {
  const isExistingSchedule = report.isScheduled;

  // Form state
  const [form, setForm] = useState<ScheduleFormData>({
    frequency: "weekly",
    time: "08:00",
    dayOfWeek: 1,
    dayOfMonth: 1,
    recipients: [],
    exportFormat: "xlsx",
  });

  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  // Pre-populate from existing schedule when dialog opens
  useEffect(() => {
    if (open) {
      if (isExistingSchedule) {
        setForm({
          frequency: report.scheduleFrequency ?? "weekly",
          time: report.scheduleTime ?? "08:00",
          dayOfWeek: report.scheduleDayOfWeek ?? 1,
          dayOfMonth: report.scheduleDayOfMonth ?? 1,
          recipients: report.scheduleRecipients ?? [],
          exportFormat: (report.scheduleExportFormat as ScheduleExportFormat) ?? "xlsx",
        });
      } else {
        setForm({
          frequency: "weekly",
          time: "08:00",
          dayOfWeek: 1,
          dayOfMonth: 1,
          recipients: [],
          exportFormat: "xlsx",
        });
      }
      setNewEmail("");
      setEmailError(null);
      setFormError(null);
    }
  }, [open, isExistingSchedule, report]);

  // Whether the selected frequency needs a day-of-week selector
  const showDayOfWeek = form.frequency === "weekly" || form.frequency === "fortnightly";
  // Whether the selected frequency needs a day-of-month selector
  const showDayOfMonth =
    form.frequency === "monthly" ||
    form.frequency === "quarterly" ||
    form.frequency === "annually";

  const handleAddRecipient = useCallback(() => {
    const email = newEmail.trim();
    if (!email) return;

    if (!EMAIL_REGEX.test(email)) {
      setEmailError("Please enter a valid email address");
      return;
    }

    if (form.recipients.some((r) => r.email.toLowerCase() === email.toLowerCase())) {
      setEmailError("This email has already been added");
      return;
    }

    setForm((prev) => ({
      ...prev,
      recipients: [...prev.recipients, { email, deliveryMethod: "email" as const }],
    }));
    setNewEmail("");
    setEmailError(null);
  }, [newEmail, form.recipients]);

  const handleRemoveRecipient = (index: number) => {
    setForm((prev) => ({
      ...prev,
      recipients: prev.recipients.filter((_, i) => i !== index),
    }));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddRecipient();
    }
  };

  const handleSave = async () => {
    setFormError(null);

    if (form.recipients.length === 0) {
      setFormError("At least one recipient email is required");
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        frequency: form.frequency,
        time: form.time || undefined,
        day_of_week: showDayOfWeek ? form.dayOfWeek : undefined,
        day_of_month: showDayOfMonth ? form.dayOfMonth : undefined,
        recipients: form.recipients,
        export_format: form.exportFormat,
      });
      onClose();
    } catch {
      setFormError("Failed to save schedule. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!onRemove) return;
    setIsRemoving(true);
    try {
      await onRemove();
      onClose();
    } catch {
      setFormError("Failed to remove schedule. Please try again.");
    } finally {
      setIsRemoving(false);
    }
  };

  const isProcessing = isSaving || isRemoving || loading;

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <ModalHeader
        title={isExistingSchedule ? "Edit Report Schedule" : "Schedule Report"}
        subtitle="Configure automated report delivery to specified recipients."
      />
      <ModalBody>
        <div className="space-y-6">
          {/* Error banner */}
          {formError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Frequency */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Frequency
            </label>
            <Select
              value={form.frequency}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  frequency: e.target.value as ScheduleFrequency,
                }))
              }
              options={FREQUENCY_OPTIONS}
            />
          </div>

          {/* Day of week (for weekly/fortnightly) */}
          {showDayOfWeek && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Day of Week
              </label>
              <Select
                value={String(form.dayOfWeek)}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    dayOfWeek: parseInt(e.target.value, 10),
                  }))
                }
                options={DAY_OF_WEEK_OPTIONS}
              />
            </div>
          )}

          {/* Day of month (for monthly/quarterly/annually) */}
          {showDayOfMonth && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Day of Month
              </label>
              <Input
                type="number"
                min={1}
                max={28}
                value={form.dayOfMonth}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    dayOfMonth: Math.min(28, Math.max(1, parseInt(e.target.value, 10) || 1)),
                  }))
                }
              />
              <p className="mt-1 text-xs text-gray-500">
                Values above 28 are capped to avoid issues with shorter months.
              </p>
            </div>
          )}

          {/* Time */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Delivery Time
              </span>
            </label>
            <Input
              type="time"
              value={form.time}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, time: e.target.value }))
              }
            />
            <p className="mt-1 text-xs text-gray-500">
              Time is in the tenant's configured timezone.
            </p>
          </div>

          {/* Export Format */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Export Format
            </label>
            <Select
              value={form.exportFormat}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  exportFormat: e.target.value as ScheduleExportFormat,
                }))
              }
              options={FORMAT_OPTIONS}
            />
          </div>

          {/* Recipients */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              <span className="flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                Recipients
              </span>
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  type="email"
                  placeholder="Enter email address"
                  value={newEmail}
                  onChange={(e) => {
                    setNewEmail(e.target.value);
                    setEmailError(null);
                  }}
                  onKeyDown={handleKeyDown}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddRecipient}
                disabled={!newEmail.trim()}
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
            {emailError && (
              <p className="mt-1 text-xs text-red-600">{emailError}</p>
            )}

            {/* Recipient list */}
            {form.recipients.length > 0 && (
              <div className="mt-3 space-y-2">
                {form.recipients.map((recipient, index) => (
                  <div
                    key={`${recipient.email}-${index}`}
                    className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-sm text-gray-700">
                        {recipient.email}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveRecipient(index)}
                      className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-red-500"
                      aria-label={`Remove ${recipient.email}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {form.recipients.length === 0 && (
              <p className="mt-2 text-xs text-gray-500">
                No recipients added yet. Add at least one email address to receive the scheduled report.
              </p>
            )}
          </div>

          {/* Schedule summary */}
          {form.recipients.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <div className="flex items-start gap-2">
                <Calendar className="mt-0.5 h-4 w-4 text-blue-600" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium">Schedule Summary</p>
                  <p className="mt-1">
                    This report will be sent{" "}
                    <strong>
                      {form.frequency}
                      {showDayOfWeek &&
                        ` on ${DAY_OF_WEEK_OPTIONS.find((d) => d.value === String(form.dayOfWeek))?.label ?? "Monday"}`}
                      {showDayOfMonth && ` on day ${form.dayOfMonth}`}
                    </strong>{" "}
                    at <strong>{form.time || "08:00"}</strong> as{" "}
                    <strong>
                      {FORMAT_OPTIONS.find((f) => f.value === form.exportFormat)?.label ?? "Excel"}
                    </strong>{" "}
                    to{" "}
                    <strong>
                      {form.recipients.length}{" "}
                      {form.recipients.length === 1 ? "recipient" : "recipients"}
                    </strong>
                    .
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Existing schedule info */}
          {isExistingSchedule && report.nextScheduledRun && (
            <div className="text-xs text-gray-500">
              Next scheduled run:{" "}
              {new Date(report.nextScheduledRun).toLocaleString()}
            </div>
          )}
        </div>
      </ModalBody>
      <ModalFooter justify="between">
        <div>
          {isExistingSchedule && onRemove && (
            <Button
              variant="danger"
              onClick={handleRemove}
              loading={isRemoving}
              disabled={isProcessing}
            >
              Remove Schedule
            </Button>
          )}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            loading={isSaving}
            disabled={isProcessing || form.recipients.length === 0}
          >
            {isExistingSchedule ? "Update Schedule" : "Save Schedule"}
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  );
}
