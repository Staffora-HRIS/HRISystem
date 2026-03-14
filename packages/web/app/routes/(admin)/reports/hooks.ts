/**
 * React Query hooks for the Reports module.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-client";
import type {
  FieldCatalogResponse,
  ReportDefinition,
  ReportExecutionResult,
  ReportConfig,
  ReportType,
} from "./types";

// ============================================================================
// Field Catalog
// ============================================================================

export function useFieldCatalog() {
  return useQuery({
    queryKey: queryKeys.reports.fieldCatalog(),
    queryFn: () => api.get<FieldCatalogResponse>("/reports/fields"),
    staleTime: 15 * 60 * 1000, // 15 minutes — catalog rarely changes
  });
}

export function useFieldValues(fieldKey: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reports.fieldValues(fieldKey),
    queryFn: () =>
      api.get<{ values: string[] }>(`/reports/fields/${encodeURIComponent(fieldKey)}/values`),
    enabled: enabled && !!fieldKey,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// Report CRUD
// ============================================================================

export function useReportsList(filters?: {
  search?: string;
  category?: string;
  type?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: [...queryKeys.reports.list(), filters],
    queryFn: () =>
      api.get<{ data: ReportDefinition[]; total: number }>("/reports", {
        params: filters as Record<string, string>,
      }),
  });
}

export function useReport(id: string) {
  return useQuery({
    queryKey: queryKeys.reports.report(id),
    queryFn: () => api.get<{ data: ReportDefinition }>(`/reports/${id}`),
    enabled: !!id,
  });
}

export function useCreateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      report_type?: ReportType;
      category?: string;
      tags?: string[];
      config: ReportConfig;
      chart_type?: string;
      chart_config?: unknown;
      is_public?: boolean;
    }) => api.post<{ data: ReportDefinition }>("/reports", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.reports.all() });
    },
  });
}

export function useUpdateReport(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name?: string;
      description?: string;
      report_type?: ReportType;
      category?: string;
      tags?: string[];
      config?: ReportConfig;
      chart_type?: string | null;
      chart_config?: unknown;
      is_public?: boolean;
    }) => api.put<{ data: ReportDefinition }>(`/reports/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.reports.report(id) });
      qc.invalidateQueries({ queryKey: queryKeys.reports.list() });
    },
  });
}

export function useDeleteReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/reports/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.reports.all() });
    },
  });
}

export function useDuplicateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ data: ReportDefinition }>(`/reports/${id}/duplicate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.reports.all() });
    },
  });
}

export function usePublishReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ data: ReportDefinition }>(`/reports/${id}/publish`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.reports.report(id) });
      qc.invalidateQueries({ queryKey: queryKeys.reports.list() });
    },
  });
}

export function useArchiveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ data: ReportDefinition }>(`/reports/${id}/archive`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.reports.report(id) });
      qc.invalidateQueries({ queryKey: queryKeys.reports.list() });
    },
  });
}

// ============================================================================
// Report Execution
// ============================================================================

export function useExecuteReport(id: string) {
  return useMutation({
    mutationFn: (params?: {
      parameters?: Record<string, unknown>;
      effectiveDateOverride?: string;
    }) => api.post<ReportExecutionResult>(`/reports/${id}/execute`, params ?? {}),
  });
}

export function usePreviewReport(id: string) {
  return useMutation({
    mutationFn: (params?: {
      parameters?: Record<string, unknown>;
    }) => api.post<ReportExecutionResult>(`/reports/${id}/execute/preview`, params ?? {}),
  });
}

// ============================================================================
// Favourites
// ============================================================================

export function useFavourites() {
  return useQuery({
    queryKey: queryKeys.reports.favourites(),
    queryFn: () => api.get<{ data: ReportDefinition[] }>("/reports/favourites"),
  });
}

export function useAddFavourite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/reports/${id}/favourite`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.reports.favourites() });
    },
  });
}

export function useRemoveFavourite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/reports/${id}/favourite`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.reports.favourites() });
    },
  });
}

// ============================================================================
// Templates
// ============================================================================

export function useSystemTemplates() {
  return useQuery({
    queryKey: queryKeys.reports.templates(),
    queryFn: () => api.get<{ data: ReportDefinition[] }>("/reports/templates"),
  });
}

export function useCreateFromTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) =>
      api.post<{ data: ReportDefinition }>(`/reports/templates/${templateId}/create`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.reports.all() });
    },
  });
}

// ============================================================================
// Export
// ============================================================================

export function useExportReport() {
  return useMutation({
    mutationFn: async ({
      id,
      format,
    }: {
      id: string;
      format: "csv" | "xlsx" | "pdf";
    }) => {
      const response = await fetch(`/api/v1/reports/${id}/export/${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] ?? `report.${format}`;

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      return { filename };
    },
  });
}

// ============================================================================
// Sharing
// ============================================================================

export function useShareReport(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      shared_with: Array<{ userId: string; permission: "view" | "edit" }>;
    }) => api.post<{ data: ReportDefinition }>(`/reports/${id}/share`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.reports.report(id) });
    },
  });
}

// ============================================================================
// Scheduling
// ============================================================================

export function useSetSchedule(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      frequency: string;
      cron?: string;
      time?: string;
      day_of_week?: number;
      day_of_month?: number;
      recipients: Array<{
        userId?: string;
        email: string;
        deliveryMethod?: "email" | "in_app" | "both";
      }>;
      export_format?: "xlsx" | "csv" | "pdf";
    }) => api.post<{ data: ReportDefinition }>(`/reports/${id}/schedule`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.reports.report(id) });
      qc.invalidateQueries({ queryKey: queryKeys.reports.scheduled() });
    },
  });
}

export function useRemoveSchedule(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/reports/${id}/schedule`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.reports.report(id) });
      qc.invalidateQueries({ queryKey: queryKeys.reports.scheduled() });
    },
  });
}
