/**
 * SecureField Component
 *
 * A permission-aware field wrapper that automatically handles field-level security.
 * Features:
 * - Automatically hides fields user cannot view
 * - Makes fields read-only when user has view-only access
 * - Supports various field types (input, select, textarea, etc.)
 * - Displays masked value for sensitive hidden fields (e.g., "***")
 */

import {
  type ReactNode,
  type ReactElement,
  cloneElement,
  isValidElement,
  useMemo,
  createContext,
  useContext,
} from "react";
import {
  useFieldPermissionContext,
  useEntityFieldPermissions,
  type FieldMetadata,
  type FieldPermissionLevel,
} from "../../hooks/use-field-permissions";
import { cn } from "../../lib/utils";

// =============================================================================
// Types
// =============================================================================

export interface SecureFieldProps {
  /** The field name (must match field_registry) */
  name: string;
  /** Override the entity from context */
  entity?: string;
  /** Children - typically an Input, Select, or custom component */
  children?: ReactNode;
  /** Custom render for view-only mode */
  renderViewOnly?: (value: any, meta: FieldMetadata | null) => ReactNode;
  /** Show a placeholder when hidden (e.g., "***" for sensitive data) */
  hiddenPlaceholder?: string;
  /** Force a specific permission level (for testing/override) */
  forcePermission?: FieldPermissionLevel;
  /** Class name for the wrapper */
  className?: string;
  /** Value to display in view-only mode */
  value?: any;
  /** Label override (defaults to field metadata label) */
  label?: string;
  /** Show loading skeleton while permissions load */
  showLoadingSkeleton?: boolean;
}

// =============================================================================
// Context for SecureForm
// =============================================================================

interface SecureFormContextType {
  entity: string;
  data: Record<string, any>;
  mode: "view" | "edit";
  isLoading: boolean;
}

const SecureFormContext = createContext<SecureFormContextType | null>(null);

export function useSecureFormContext() {
  return useContext(SecureFormContext);
}

// =============================================================================
// SecureField Component
// =============================================================================

export function SecureField({
  name,
  entity: entityOverride,
  children,
  renderViewOnly,
  hiddenPlaceholder,
  forcePermission,
  className,
  value: valueProp,
  label: labelOverride,
  showLoadingSkeleton = true,
}: SecureFieldProps) {
  const formContext = useSecureFormContext();
  const { canView, canEdit, isHidden, isLoading: permissionsLoading } = useFieldPermissionContext();

  // Determine entity from props or context
  const entity = entityOverride || formContext?.entity;

  // Get value from props or form context
  const value = valueProp ?? formContext?.data?.[name];

  // Get field metadata for label
  const { getFieldMeta, isLoading: metaLoading } = useEntityFieldPermissions(entity ?? "");
  const fieldMeta = entity ? getFieldMeta(name) : null;

  // Determine permission level
  const permission = useMemo((): FieldPermissionLevel => {
    if (forcePermission) return forcePermission;
    if (!entity) return "hidden";
    if (canEdit(entity, name)) return "edit";
    if (canView(entity, name)) return "view";
    return "hidden";
  }, [forcePermission, entity, name, canEdit, canView]);

  const isFieldHidden = forcePermission ? forcePermission === "hidden" : (entity ? isHidden(entity, name) : true);
  const isViewOnly = permission === "view";
  const loading = permissionsLoading || metaLoading;

  // Derive label
  const label = labelOverride ?? fieldMeta?.fieldLabel ?? name;

  // Loading state
  if (loading && showLoadingSkeleton) {
    return (
      <div className={cn("animate-pulse", className)}>
        <div className="mb-1.5 h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-10 w-full rounded-lg bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  // Hidden field - show placeholder or nothing
  if (isFieldHidden) {
    if (hiddenPlaceholder) {
      return (
        <div className={cn("space-y-1.5", className)}>
          <span className="block text-sm font-medium text-gray-500 dark:text-gray-400">
            {label}
          </span>
          <span className="block text-sm text-gray-400 dark:text-gray-500 italic">
            {hiddenPlaceholder}
          </span>
        </div>
      );
    }
    return null;
  }

  // View-only mode
  if (isViewOnly) {
    if (renderViewOnly) {
      return (
        <div className={className}>
          {renderViewOnly(value, fieldMeta)}
        </div>
      );
    }

    return (
      <div className={cn("space-y-1.5", className)}>
        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </span>
        <span className="block text-sm text-gray-900 dark:text-gray-100">
          {formatDisplayValue(value, fieldMeta)}
        </span>
      </div>
    );
  }

  // Edit mode - render children with modifications
  if (!children) {
    return (
      <div className={cn("space-y-1.5", className)}>
        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </span>
        <span className="block text-sm text-gray-500 dark:text-gray-400 italic">
          No field component provided
        </span>
      </div>
    );
  }

  // Clone children with additional props
  if (isValidElement(children)) {
    return cloneElement(children as ReactElement<any>, {
      name,
      label: (children.props as any)?.label ?? label,
      disabled: (children.props as any)?.disabled,
    });
  }

  return <>{children}</>;
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatDisplayValue(value: any, meta: FieldMetadata | null): string {
  if (value === null || value === undefined) {
    return "-";
  }

  if (meta?.dataType === "date") {
    try {
      return new Date(value).toLocaleDateString();
    } catch {
      return String(value);
    }
  }

  if (meta?.dataType === "datetime") {
    try {
      return new Date(value).toLocaleString();
    } catch {
      return String(value);
    }
  }

  if (meta?.dataType === "boolean") {
    return value ? "Yes" : "No";
  }

  if (meta?.dataType === "currency") {
    if (typeof value === "number") {
      return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
      }).format(value);
    }
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

// =============================================================================
// SecureForm Component
// =============================================================================

export interface SecureFormProps {
  /** The entity type for field permissions */
  entity: string;
  /** The data object containing field values */
  data: Record<string, any>;
  /** Form mode - view or edit */
  mode?: "view" | "edit";
  /** Children (SecureField components) */
  children: ReactNode;
  /** Called when form is submitted */
  onSubmit?: (data: Record<string, any>) => void;
  /** Class name for the form */
  className?: string;
  /** Form ID for accessibility */
  id?: string;
}

export function SecureForm({
  entity,
  data,
  mode = "edit",
  children,
  onSubmit,
  className,
  id,
}: SecureFormProps) {
  const { isLoading } = useEntityFieldPermissions(entity);

  const contextValue: SecureFormContextType = useMemo(
    () => ({
      entity,
      data,
      mode,
      isLoading,
    }),
    [entity, data, mode, isLoading]
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit?.(data);
  };

  return (
    <SecureFormContext.Provider value={contextValue}>
      <form
        id={id}
        onSubmit={handleSubmit}
        className={cn("space-y-4", className)}
      >
        {children}
      </form>
    </SecureFormContext.Provider>
  );
}

// =============================================================================
// SecureFieldGroup Component
// =============================================================================

export interface SecureFieldGroupProps {
  /** Group name (matches field_registry group) */
  group: string;
  /** Entity for the fields */
  entity: string;
  /** Title for the group */
  title?: string;
  /** Children (SecureField components) */
  children: ReactNode;
  /** Class name for the group wrapper */
  className?: string;
  /** Collapse the group if all fields are hidden */
  collapseIfEmpty?: boolean;
}

export function SecureFieldGroup({
  group,
  entity,
  title,
  children,
  className,
  collapseIfEmpty = true,
}: SecureFieldGroupProps) {
  const { groups, isLoading } = useEntityFieldPermissions(entity);

  // Find fields in this group that user can view
  const groupFields = useMemo(() => {
    const entityGroup = groups.find((g) => g.groupName === group);
    if (!entityGroup) return [];
    return entityGroup.fields.filter((f) => f.canView);
  }, [groups, group]);

  // If all fields are hidden and we should collapse, return null
  if (collapseIfEmpty && !isLoading && groupFields.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-4", className)}>
      {title && (
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2">
          {title}
        </h3>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {children}
      </div>
    </div>
  );
}

// =============================================================================
// SecureValue Component (for display-only scenarios)
// =============================================================================

export interface SecureValueProps {
  /** The field name */
  name: string;
  /** The entity type */
  entity: string;
  /** The value to display */
  value: any;
  /** Show placeholder for hidden fields */
  hiddenPlaceholder?: string;
  /** Custom formatter */
  formatter?: (value: any) => string;
  /** Class name */
  className?: string;
}

export function SecureValue({
  name,
  entity,
  value,
  hiddenPlaceholder = "***",
  formatter,
  className,
}: SecureValueProps) {
  const { canView, isLoading } = useFieldPermissionContext();
  const { getFieldMeta } = useEntityFieldPermissions(entity);

  if (isLoading) {
    return <span className="animate-pulse h-4 w-16 inline-block bg-gray-200 dark:bg-gray-700 rounded" />;
  }

  if (!canView(entity, name)) {
    return <span className={cn("text-gray-400 dark:text-gray-500 italic", className)}>{hiddenPlaceholder}</span>;
  }

  const meta = getFieldMeta(name);
  const displayValue = formatter ? formatter(value) : formatDisplayValue(value, meta);

  return <span className={className}>{displayValue}</span>;
}

// =============================================================================
// withFieldPermission HOC
// =============================================================================

export interface WithFieldPermissionOptions {
  entity: string;
  field: string;
  fallback?: ReactNode;
}

export function withFieldPermission<P extends object>(
  Component: React.ComponentType<P>,
  options: WithFieldPermissionOptions
) {
  return function FieldPermissionWrapper(props: P) {
    const { canView, canEdit, isLoading } = useFieldPermissionContext();

    if (isLoading) {
      return null;
    }

    if (!canView(options.entity, options.field)) {
      return options.fallback ? <>{options.fallback}</> : null;
    }

    const isReadOnly = !canEdit(options.entity, options.field);

    return <Component {...props} readOnly={isReadOnly} disabled={isReadOnly} />;
  };
}
