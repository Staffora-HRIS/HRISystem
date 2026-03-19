/**
 * Lookup Values Data Hook
 *
 * Encapsulates all data fetching (queries) and mutations for the
 * lookup values admin page — categories and their values.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "~/components/ui";
import { api } from "~/lib/api-client";
import type {
  LookupCategory,
  LookupValue,
  PaginatedResponse,
} from "./types";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const lookupKeys = {
  categories: (search?: string) => ["lookup-categories", search] as const,
  values: (categoryId?: string, search?: string) =>
    ["lookup-values", categoryId, search] as const,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useLookupValues(options: {
  catSearch: string;
  valSearch: string;
  selectedCategory: LookupCategory | null;
  onCategoryCreated: () => void;
  onCategoryUpdated: (updated: LookupCategory) => void;
  onCategoryDeleted: () => void;
  onValueCreated: () => void;
  onValueUpdated: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();

  // =========================================================================
  // Category Queries & Mutations
  // =========================================================================

  const categoriesQuery = useQuery({
    queryKey: lookupKeys.categories(options.catSearch),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options.catSearch) params.set("search", options.catSearch);
      params.set("limit", "100");
      return api.get<PaginatedResponse<LookupCategory>>(
        `/lookup-values/categories?${params}`
      );
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: (data: { code: string; name: string; description?: string }) =>
      api.post<LookupCategory>("/lookup-values/categories", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lookup-categories"] });
      toast.success("Category created successfully");
      options.onCategoryCreated();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create category");
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; description?: string | null; isActive?: boolean };
    }) => api.patch<LookupCategory>(`/lookup-values/categories/${id}`, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["lookup-categories"] });
      toast.success("Category updated");
      if (updated) {
        options.onCategoryUpdated(updated);
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update category");
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/lookup-values/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lookup-categories"] });
      toast.success("Category deleted");
      options.onCategoryDeleted();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete category");
    },
  });

  const seedMutation = useMutation({
    mutationFn: () => api.post("/lookup-values/seed", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lookup-categories"] });
      toast.success("Default categories seeded successfully");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to seed defaults");
    },
  });

  // =========================================================================
  // Value Queries & Mutations
  // =========================================================================

  const valuesQuery = useQuery({
    queryKey: lookupKeys.values(options.selectedCategory?.id, options.valSearch),
    queryFn: async () => {
      if (!options.selectedCategory)
        return { items: [], nextCursor: null, hasMore: false };
      const params = new URLSearchParams();
      if (options.valSearch) params.set("search", options.valSearch);
      params.set("limit", "100");
      return api.get<PaginatedResponse<LookupValue>>(
        `/lookup-values/categories/${options.selectedCategory.id}/values?${params}`
      );
    },
    enabled: !!options.selectedCategory,
  });

  const createValueMutation = useMutation({
    mutationFn: (data: {
      code: string;
      label: string;
      description?: string;
      sortOrder?: number;
      isDefault?: boolean;
    }) =>
      api.post<LookupValue>(
        `/lookup-values/categories/${options.selectedCategory!.id}/values`,
        data
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lookup-values"] });
      queryClient.invalidateQueries({ queryKey: ["lookup-categories"] });
      toast.success("Value created successfully");
      options.onValueCreated();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create value");
    },
  });

  const updateValueMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        label?: string;
        description?: string | null;
        sortOrder?: number;
        isDefault?: boolean;
        isActive?: boolean;
      };
    }) => api.patch<LookupValue>(`/lookup-values/values/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lookup-values"] });
      toast.success("Value updated");
      options.onValueUpdated();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update value");
    },
  });

  const deleteValueMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/lookup-values/values/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lookup-values"] });
      queryClient.invalidateQueries({ queryKey: ["lookup-categories"] });
      toast.success("Value deleted");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete value");
    },
  });

  // =========================================================================
  // Computed
  // =========================================================================

  const categories = categoriesQuery.data?.items ?? [];
  const values = valuesQuery.data?.items ?? [];

  const stats = {
    totalCategories: categories.length,
    activeCategories: categories.filter((c) => c.isActive).length,
    systemCategories: categories.filter((c) => c.isSystem).length,
    totalValues: categories.reduce((sum, c) => sum + (c.valueCount ?? 0), 0),
  };

  return {
    // Queries
    categoriesQuery,
    valuesQuery,
    categories,
    values,
    stats,
    // Category mutations
    createCategoryMutation,
    updateCategoryMutation,
    deleteCategoryMutation,
    seedMutation,
    // Value mutations
    createValueMutation,
    updateValueMutation,
    deleteValueMutation,
  };
}
