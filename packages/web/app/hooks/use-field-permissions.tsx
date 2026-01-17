/**
 * Field Permission Hooks
 *
 * Provides field-level security for forms and displays.
 * Features:
 * - useFieldPermissions(entity) - get permissions for an entity's fields
 * - useCanEditField(entity, field) - check if field is editable
 * - useCanViewField(entity, field) - check if field is viewable
 * - FieldPermissionGate - component for conditional field rendering
 */

import { useMemo, useCallback, createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { queryKeys } from "../lib/query-client";
import { useSession } from "../lib/auth";

// =============================================================================
// Types
// =============================================================================

export type FieldPermissionLevel = "edit" | "view" | "hidden";

export interface FieldMetadata {
  entityName: string;
  fieldName: string;
  fieldLabel: string;
  fieldGroup: string | null;
  dataType: string;
  isSensitive: boolean;
  canView: boolean;
  canEdit: boolean;
  isHidden: boolean;
}

export interface EntityFieldGroup {
  groupName: string;
  fields: FieldMetadata[];
}

export interface FieldPermission {
  entityName: string;
  fieldName: string;
  permission: FieldPermissionLevel;
}

interface MyFieldPermissionsResponse {
  permissions?: FieldPermission[];
  groups?: EntityFieldGroup[];
}

// =============================================================================
// API Functions
// =============================================================================

async function fetchAllFieldPermissions(): Promise<FieldPermission[]> {
  const response = await api.get<MyFieldPermissionsResponse>("/fields/my-permissions");
  return response.permissions ?? [];
}

async function fetchEntityFieldMetadata(entity: string): Promise<EntityFieldGroup[]> {
  const response = await api.get<MyFieldPermissionsResponse>(
    `/fields/my-permissions?entity=${encodeURIComponent(entity)}`
  );
  return response.groups ?? [];
}

// =============================================================================
// Context
// =============================================================================

interface FieldPermissionContextType {
  permissions: Map<string, FieldPermission>;
  isLoading: boolean;
  error: Error | null;
  canView: (entity: string, field: string) => boolean;
  canEdit: (entity: string, field: string) => boolean;
  isHidden: (entity: string, field: string) => boolean;
  getPermission: (entity: string, field: string) => FieldPermissionLevel;
  refetch: () => void;
}

const FieldPermissionContext = createContext<FieldPermissionContextType | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface FieldPermissionProviderProps {
  children: ReactNode;
}

export function FieldPermissionProvider({ children }: FieldPermissionProviderProps) {
  const { isAuthenticated } = useSession();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.security.fieldPermissions(),
    queryFn: fetchAllFieldPermissions,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const permissions = useMemo(() => {
    const map = new Map<string, FieldPermission>();
    if (data) {
      for (const perm of data) {
        const key = `${perm.entityName}.${perm.fieldName}`;
        map.set(key, perm);
      }
    }
    return map;
  }, [data]);

  const getPermission = useCallback(
    (entity: string, field: string): FieldPermissionLevel => {
      const key = `${entity}.${field}`;
      return permissions.get(key)?.permission ?? "hidden";
    },
    [permissions]
  );

  const canView = useCallback(
    (entity: string, field: string): boolean => {
      const perm = getPermission(entity, field);
      return perm === "view" || perm === "edit";
    },
    [getPermission]
  );

  const canEdit = useCallback(
    (entity: string, field: string): boolean => {
      return getPermission(entity, field) === "edit";
    },
    [getPermission]
  );

  const isHidden = useCallback(
    (entity: string, field: string): boolean => {
      return getPermission(entity, field) === "hidden";
    },
    [getPermission]
  );

  const value: FieldPermissionContextType = {
    permissions,
    isLoading,
    error: error as Error | null,
    canView,
    canEdit,
    isHidden,
    getPermission,
    refetch,
  };

  return (
    <FieldPermissionContext.Provider value={value}>
      {children}
    </FieldPermissionContext.Provider>
  );
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Use the field permission context
 */
export function useFieldPermissionContext(): FieldPermissionContextType {
  const context = useContext(FieldPermissionContext);
  if (!context) {
    throw new Error(
      "useFieldPermissionContext must be used within a FieldPermissionProvider"
    );
  }
  return context;
}

/**
 * Get field permissions for a specific entity with grouped metadata
 */
export function useEntityFieldPermissions(entity: string) {
  const { isAuthenticated } = useSession();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.security.entityFieldPermissions(entity),
    queryFn: () => fetchEntityFieldMetadata(entity),
    enabled: isAuthenticated && !!entity,
    staleTime: 5 * 60 * 1000,
  });

  const fields = useMemo(() => {
    if (!data) return [];
    return data.flatMap((group) => group.fields);
  }, [data]);

  const groups = useMemo(() => data ?? [], [data]);

  const fieldMap = useMemo(() => {
    const map = new Map<string, FieldMetadata>();
    for (const field of fields) {
      map.set(field.fieldName, field);
    }
    return map;
  }, [fields]);

  const canView = useCallback(
    (fieldName: string): boolean => {
      return fieldMap.get(fieldName)?.canView ?? false;
    },
    [fieldMap]
  );

  const canEdit = useCallback(
    (fieldName: string): boolean => {
      return fieldMap.get(fieldName)?.canEdit ?? false;
    },
    [fieldMap]
  );

  const isHidden = useCallback(
    (fieldName: string): boolean => {
      return fieldMap.get(fieldName)?.isHidden ?? true;
    },
    [fieldMap]
  );

  const getFieldMeta = useCallback(
    (fieldName: string): FieldMetadata | null => {
      return fieldMap.get(fieldName) ?? null;
    },
    [fieldMap]
  );

  const editableFields = useMemo(
    () => fields.filter((f) => f.canEdit).map((f) => f.fieldName),
    [fields]
  );

  const visibleFields = useMemo(
    () => fields.filter((f) => f.canView).map((f) => f.fieldName),
    [fields]
  );

  return {
    fields,
    groups,
    isLoading,
    error,
    refetch,
    canView,
    canEdit,
    isHidden,
    getFieldMeta,
    editableFields,
    visibleFields,
  };
}

/**
 * Simple hook to check if a field is editable
 */
export function useCanEditField(entity: string, field: string): boolean {
  const { canEdit, isLoading } = useFieldPermissionContext();
  if (isLoading) return false;
  return canEdit(entity, field);
}

/**
 * Simple hook to check if a field is viewable
 */
export function useCanViewField(entity: string, field: string): boolean {
  const { canView, isLoading } = useFieldPermissionContext();
  if (isLoading) return false;
  return canView(entity, field);
}

/**
 * Simple hook to check if a field is hidden
 */
export function useIsFieldHidden(entity: string, field: string): boolean {
  const { isHidden, isLoading } = useFieldPermissionContext();
  if (isLoading) return true; // Default to hidden while loading
  return isHidden(entity, field);
}

// =============================================================================
// Components
// =============================================================================

interface FieldPermissionGateProps {
  entity: string;
  field: string;
  mode?: "view" | "edit";
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Conditionally render based on field permissions
 */
export function FieldPermissionGate({
  entity,
  field,
  mode = "view",
  fallback = null,
  children,
}: FieldPermissionGateProps) {
  const { canView, canEdit, isLoading } = useFieldPermissionContext();

  if (isLoading) {
    return null;
  }

  const hasAccess = mode === "edit" ? canEdit(entity, field) : canView(entity, field);

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

interface FieldVisibilityProps {
  entity: string;
  field: string;
  children: ReactNode;
}

/**
 * Only render if field is visible (not hidden)
 */
export function FieldVisibility({ entity, field, children }: FieldVisibilityProps) {
  const { isHidden, isLoading } = useFieldPermissionContext();

  if (isLoading || isHidden(entity, field)) {
    return null;
  }

  return <>{children}</>;
}

// =============================================================================
// Query Key Extensions
// =============================================================================

// Extend query keys for field permissions
declare module "../lib/query-client" {
  interface QueryKeys {
    security: {
      fieldPermissions: () => readonly ["security", "field-permissions"];
      entityFieldPermissions: (entity: string) => readonly ["security", "field-permissions", string];
    };
  }
}

// Add query keys if not already present
if (!queryKeys.security) {
  (queryKeys as any).security = {
    fieldPermissions: () => ["security", "field-permissions"] as const,
    entityFieldPermissions: (entity: string) =>
      ["security", "field-permissions", entity] as const,
  };
}
