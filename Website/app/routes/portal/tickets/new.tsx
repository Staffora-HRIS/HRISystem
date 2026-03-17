import { useState, useRef, type FormEvent, type DragEvent } from "react";
import { Link, useNavigate } from "react-router";
import {
  ChevronRight,
  Upload,
  X,
  FileText,
  FileImage,
  FileSpreadsheet,
  File,
  Loader2,
  Clock,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi } from "~/lib/portal-api";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const CATEGORIES = [
  { value: "technical", label: "Technical Issue", description: "System bugs, errors, or functionality problems" },
  { value: "billing", label: "Billing", description: "Invoices, payments, or subscription questions" },
  { value: "feature_request", label: "Feature Request", description: "Suggest new features or improvements" },
  { value: "account", label: "Account", description: "User access, permissions, or account settings" },
  { value: "integration", label: "Integration", description: "API, webhooks, or third-party integrations" },
  { value: "data", label: "Data", description: "Data migration, import/export, or corrections" },
  { value: "security", label: "Security", description: "Security concerns or vulnerability reports" },
  { value: "general", label: "General", description: "General questions or other enquiries" },
];

const PRIORITIES = [
  { value: "low", label: "Low", sla: "48 hours", description: "General questions, no business impact" },
  { value: "medium", label: "Medium", sla: "24 hours", description: "Minor issue, workaround available" },
  { value: "high", label: "High", sla: "8 hours", description: "Significant impact on operations" },
  { value: "critical", label: "Critical", sla: "2 hours", description: "System down, blocking all users" },
];

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
];

const ACCEPTED_EXTENSIONS = ".pdf,.png,.jpg,.jpeg,.gif,.doc,.docx,.xlsx,.csv,.txt";
const MAX_FILES = 5;
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return FileImage;
  if (type.includes("spreadsheet") || type === "text/csv") return FileSpreadsheet;
  if (type.includes("pdf") || type.includes("word") || type.includes("document"))
    return FileText;
  return File;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function meta() {
  return [{ title: "New Support Ticket - Staffora Portal" }];
}

export default function NewTicketPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("medium");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Validation
  const [touched, setTouched] = useState({
    subject: false,
    category: false,
    description: false,
  });

  const subjectError =
    touched.subject && !subject.trim()
      ? "Subject is required"
      : touched.subject && subject.length > 200
        ? "Subject must be 200 characters or fewer"
        : null;

  const categoryError =
    touched.category && !category ? "Please select a category" : null;

  const descriptionError =
    touched.description && !description.trim()
      ? "Description is required"
      : touched.description && description.trim().length < 20
        ? "Description must be at least 20 characters"
        : null;

  const canSubmit =
    subject.trim() &&
    subject.length <= 200 &&
    category &&
    description.trim().length >= 20;

  const selectedPriority = PRIORITIES.find((p) => p.value === priority);

  // File handling
  function addFiles(newFiles: FileList | File[]) {
    const fileArray = Array.from(newFiles);
    const validFiles: File[] = [];
    const errors: string[] = [];

    for (const file of fileArray) {
      if (files.length + validFiles.length >= MAX_FILES) {
        errors.push(`Maximum ${MAX_FILES} files allowed`);
        break;
      }
      if (file.size > MAX_SIZE) {
        errors.push(`${file.name} exceeds 10MB limit`);
        continue;
      }
      if (!ACCEPTED_TYPES.includes(file.type)) {
        errors.push(`${file.name} is not a supported file type`);
        continue;
      }
      validFiles.push(file);
    }

    if (errors.length > 0) {
      setError(errors.join(". "));
      setTimeout(() => setError(null), 5000);
    }

    if (validFiles.length > 0) {
      setFiles((prev) => [...prev, ...validFiles]);
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched({ subject: true, category: true, description: true });

    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await portalApi.tickets.create({
        subject: subject.trim(),
        category,
        priority,
        description: description.trim(),
        // In a real implementation, files would be uploaded via multipart/form-data
        attachmentCount: files.length,
      });

      setToast("Ticket created successfully! Redirecting...");
      setTimeout(() => {
        navigate("/portal/tickets");
      }, 1500);
    } catch {
      setError("Failed to create ticket. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-medium text-green-700 shadow-lg animate-fade-in-down">
          <CheckCircle className="h-5 w-5 text-green-500" />
          {toast}
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500" aria-label="Breadcrumb">
        <Link to="/portal/tickets" className="hover:text-brand-600 transition">
          Tickets
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-gray-900">New Ticket</span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New Support Ticket</h1>
        <p className="mt-1 text-sm text-gray-500">
          Describe your issue and we will get back to you as soon as possible.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 animate-fade-in" role="alert">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-6">
          {/* Subject */}
          <div>
            <label htmlFor="subject" className="mb-1.5 block text-sm font-medium text-gray-700">
              Subject <span className="text-red-500">*</span>
            </label>
            <input
              id="subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, subject: true }))}
              maxLength={200}
              placeholder="Brief summary of your issue"
              className={cn(
                "block w-full rounded-xl border bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:outline-none focus:ring-2",
                subjectError
                  ? "border-red-300 focus:border-red-400 focus:ring-red-200"
                  : "border-gray-200 focus:border-brand-400 focus:ring-brand-200",
              )}
              aria-invalid={subjectError ? "true" : undefined}
              aria-describedby={subjectError ? "subject-error" : "subject-count"}
            />
            <div className="mt-1.5 flex items-center justify-between">
              {subjectError ? (
                <p id="subject-error" className="text-xs text-red-600">
                  {subjectError}
                </p>
              ) : (
                <span />
              )}
              <p id="subject-count" className="text-xs text-gray-400">
                {subject.length}/200
              </p>
            </div>
          </div>

          {/* Category */}
          <div>
            <label htmlFor="category" className="mb-1.5 block text-sm font-medium text-gray-700">
              Category <span className="text-red-500">*</span>
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, category: true }))}
              className={cn(
                "block w-full rounded-xl border bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:outline-none focus:ring-2",
                categoryError
                  ? "border-red-300 focus:border-red-400 focus:ring-red-200"
                  : "border-gray-200 focus:border-brand-400 focus:ring-brand-200",
              )}
              aria-invalid={categoryError ? "true" : undefined}
              aria-describedby={categoryError ? "category-error" : undefined}
            >
              <option value="">Select a category...</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label} - {c.description}
                </option>
              ))}
            </select>
            {categoryError && (
              <p id="category-error" className="mt-1.5 text-xs text-red-600">
                {categoryError}
              </p>
            )}
          </div>

          {/* Priority */}
          <fieldset>
            <legend className="mb-3 text-sm font-medium text-gray-700">
              Priority <span className="text-red-500">*</span>
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {PRIORITIES.map((p) => (
                <label
                  key={p.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition",
                    priority === p.value
                      ? "border-brand-400 bg-brand-50/50 ring-2 ring-brand-200"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
                  )}
                >
                  <input
                    type="radio"
                    name="priority"
                    value={p.value}
                    checked={priority === p.value}
                    onChange={(e) => setPriority(e.target.value)}
                    className="mt-0.5 h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-900">
                      {p.label}
                    </span>
                    <p className="mt-0.5 text-xs text-gray-500">{p.description}</p>
                  </div>
                </label>
              ))}
            </div>
            {selectedPriority && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-brand-50 px-4 py-2.5">
                <Clock className="h-4 w-4 text-brand-600" />
                <p className="text-sm text-brand-700">
                  Estimated response time:{" "}
                  <span className="font-semibold">{selectedPriority.sla}</span>
                </p>
              </div>
            )}
          </fieldset>

          {/* Description */}
          <div>
            <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-gray-700">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, description: true }))}
              rows={6}
              placeholder="Describe your issue in detail. Include steps to reproduce, expected behaviour, and any error messages."
              className={cn(
                "block w-full resize-y rounded-xl border bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:outline-none focus:ring-2",
                descriptionError
                  ? "border-red-300 focus:border-red-400 focus:ring-red-200"
                  : "border-gray-200 focus:border-brand-400 focus:ring-brand-200",
              )}
              aria-invalid={descriptionError ? "true" : undefined}
              aria-describedby={
                descriptionError ? "description-error" : "description-count"
              }
            />
            <div className="mt-1.5 flex items-center justify-between">
              {descriptionError ? (
                <p id="description-error" className="text-xs text-red-600">
                  {descriptionError}
                </p>
              ) : (
                <span />
              )}
              <p id="description-count" className="text-xs text-gray-400">
                {description.trim().length} characters (min 20)
              </p>
            </div>
          </div>

          {/* File Attachments */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Attachments
            </label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="Upload files by clicking or dropping"
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 transition",
                isDragging
                  ? "border-brand-400 bg-brand-50"
                  : "border-gray-300 hover:border-gray-400 hover:bg-gray-50",
                files.length >= MAX_FILES && "pointer-events-none opacity-50",
              )}
            >
              <Upload className="h-8 w-8 text-gray-400" />
              <p className="mt-2 text-sm font-medium text-gray-700">
                Drop files here or click to browse
              </p>
              <p className="mt-1 text-xs text-gray-400">
                PDF, PNG, JPG, GIF, DOC, DOCX, XLSX, CSV, TXT -- Max 5 files, 10MB each
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS}
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
              className="hidden"
              aria-hidden="true"
            />

            {/* File list */}
            {files.length > 0 && (
              <ul className="mt-3 space-y-2" role="list">
                {files.map((file, index) => {
                  const Icon = getFileIcon(file.type);
                  return (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5"
                    >
                      <Icon className="h-5 w-5 flex-shrink-0 text-gray-400" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-gray-700">
                          {file.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(index);
                        }}
                        className="rounded-md p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition"
                        aria-label={`Remove ${file.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Link
            to="/portal/tickets"
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2",
              isSubmitting
                ? "cursor-not-allowed bg-brand-400"
                : "bg-brand-600 hover:bg-brand-700",
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Ticket"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
