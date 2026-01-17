/**
 * Field Permission Service
 *
 * Manages field-level security permissions.
 * Provides methods to check, retrieve, and manage field permissions per role.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  FieldPermissionLevel,
  FieldRegistry,
  FieldWithPermission,
  EffectiveFieldPermission,
  FieldMetadata,
  EntityFieldGroup,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

export interface TenantContext {
  tenantId: string;
  userId: string;
}

interface FieldPermissionRow {
  entity_name: string;
  field_name: string;
  field_label: string;
  field_group: string | null;
  data_type: string;
  is_sensitive: boolean;
  is_system_field: boolean;
  permission: FieldPermissionLevel;
  display_order: number;
  id: string;
}

interface EffectivePermissionRow {
  entity_name: string;
  field_name: string;
  effective_permission: FieldPermissionLevel;
}

// =============================================================================
// Field Permission Service
// =============================================================================

export class FieldPermissionService {
  constructor(private db: DatabaseClient) {}

  /**
   * Get all fields in the registry
   */
  async getAllFields(ctx: TenantContext): Promise<FieldRegistry[]> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<FieldPermissionRow[]>`
        SELECT
          id,
          entity_name,
          field_name,
          field_label,
          field_group,
          data_type,
          is_sensitive,
          is_system_field,
          default_permission as permission,
          display_order
        FROM app.field_registry
        WHERE tenant_id IS NULL OR tenant_id = ${ctx.tenantId}::uuid
        ORDER BY entity_name, display_order, field_name
      `;
    });

    return rows.map(this.mapFieldRow);
  }

  /**
   * Get fields for a specific entity
   */
  async getEntityFields(
    ctx: TenantContext,
    entityName: string
  ): Promise<FieldRegistry[]> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<FieldPermissionRow[]>`
        SELECT
          id,
          entity_name,
          field_name,
          field_label,
          field_group,
          data_type,
          is_sensitive,
          is_system_field,
          default_permission as permission,
          display_order
        FROM app.field_registry
        WHERE (tenant_id IS NULL OR tenant_id = ${ctx.tenantId}::uuid)
          AND entity_name = ${entityName}
        ORDER BY display_order, field_name
      `;
    });

    return rows.map(this.mapFieldRow);
  }

  /**
   * Get field permissions for a specific role
   */
  async getRoleFieldPermissions(
    ctx: TenantContext,
    roleId: string
  ): Promise<FieldWithPermission[]> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<FieldPermissionRow[]>`
        SELECT
          fr.id,
          fr.entity_name,
          fr.field_name,
          fr.field_label,
          fr.field_group,
          fr.data_type,
          fr.is_sensitive,
          fr.is_system_field,
          COALESCE(rfp.permission, fr.default_permission) as permission,
          fr.display_order
        FROM app.field_registry fr
        LEFT JOIN app.role_field_permissions rfp
          ON rfp.field_id = fr.id
          AND rfp.role_id = ${roleId}::uuid
        WHERE fr.tenant_id IS NULL OR fr.tenant_id = ${ctx.tenantId}::uuid
        ORDER BY fr.entity_name, fr.display_order, fr.field_name
      `;
    });

    return rows.map((row) => ({
      id: row.id,
      entityName: row.entity_name,
      fieldName: row.field_name,
      fieldLabel: row.field_label,
      fieldGroup: row.field_group,
      dataType: row.data_type,
      isSensitive: row.is_sensitive,
      isSystemField: row.is_system_field,
      permission: row.permission,
      displayOrder: row.display_order,
    }));
  }

  /**
   * Get effective field permissions for a user (across all their roles)
   * Most permissive permission wins: edit > view > hidden
   */
  async getUserFieldPermissions(
    ctx: TenantContext
  ): Promise<Map<string, EffectiveFieldPermission>> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<EffectivePermissionRow[]>`
        SELECT * FROM app.get_user_field_permissions(${ctx.userId}::uuid)
      `;
    });

    const permissions = new Map<string, EffectiveFieldPermission>();
    for (const row of rows) {
      const key = `${row.entity_name}.${row.field_name}`;
      permissions.set(key, {
        entityName: row.entity_name,
        fieldName: row.field_name,
        permission: row.effective_permission,
      });
    }

    return permissions;
  }

  /**
   * Get field metadata for UI rendering for a specific entity
   */
  async getFieldMetadata(
    ctx: TenantContext,
    entityName: string
  ): Promise<FieldMetadata[]> {
    const userPermissions = await this.getUserFieldPermissions(ctx);

    const fields = await this.getEntityFields(ctx, entityName);

    return fields.map((field) => {
      const key = `${field.entityName}.${field.fieldName}`;
      const perm = userPermissions.get(key)?.permission ?? "hidden";

      return {
        entityName: field.entityName,
        fieldName: field.fieldName,
        fieldLabel: field.fieldLabel,
        fieldGroup: field.fieldGroup,
        dataType: field.dataType,
        isSensitive: field.isSensitive,
        canView: perm === "view" || perm === "edit",
        canEdit: perm === "edit",
        isHidden: perm === "hidden",
      };
    });
  }

  /**
   * Get field metadata grouped by field group
   */
  async getFieldMetadataGrouped(
    ctx: TenantContext,
    entityName: string
  ): Promise<EntityFieldGroup[]> {
    const metadata = await this.getFieldMetadata(ctx, entityName);

    const groups = new Map<string, FieldMetadata[]>();
    for (const field of metadata) {
      const groupName = field.fieldGroup ?? "Other";
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName)!.push(field);
    }

    return Array.from(groups.entries()).map(([groupName, fields]) => ({
      groupName,
      fields,
    }));
  }

  /**
   * Check if user can edit a specific field
   */
  async canEditField(
    ctx: TenantContext,
    entityName: string,
    fieldName: string
  ): Promise<boolean> {
    const result = await this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<{ can_edit: boolean }[]>`
        SELECT app.can_user_edit_field(
          ${ctx.userId}::uuid,
          ${entityName},
          ${fieldName}
        ) as can_edit
      `;
      return rows[0]?.can_edit ?? false;
    });

    return result;
  }

  /**
   * Check if user can view a specific field
   */
  async canViewField(
    ctx: TenantContext,
    entityName: string,
    fieldName: string
  ): Promise<boolean> {
    const permissions = await this.getUserFieldPermissions(ctx);
    const key = `${entityName}.${fieldName}`;
    const perm = permissions.get(key)?.permission ?? "hidden";
    return perm === "view" || perm === "edit";
  }

  /**
   * Set field permission for a role
   */
  async setRoleFieldPermission(
    ctx: TenantContext,
    roleId: string,
    fieldId: string,
    permission: FieldPermissionLevel
  ): Promise<void> {
    await this.db.withTransaction(ctx, async (tx) => {
      await tx`
        INSERT INTO app.role_field_permissions (
          tenant_id, role_id, field_id, permission, created_by, updated_by
        )
        VALUES (
          ${ctx.tenantId}::uuid,
          ${roleId}::uuid,
          ${fieldId}::uuid,
          ${permission},
          ${ctx.userId}::uuid,
          ${ctx.userId}::uuid
        )
        ON CONFLICT (tenant_id, role_id, field_id)
        DO UPDATE SET
          permission = EXCLUDED.permission,
          updated_by = EXCLUDED.updated_by,
          updated_at = now()
      `;
    });
  }

  /**
   * Bulk set field permissions for a role
   */
  async bulkSetRoleFieldPermissions(
    ctx: TenantContext,
    roleId: string,
    permissions: Array<{ fieldId: string; permission: FieldPermissionLevel }>
  ): Promise<number> {
    const permissionsJson = JSON.stringify(
      permissions.map((p) => ({
        field_id: p.fieldId,
        permission: p.permission,
      }))
    );

    const result = await this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<{ count: number }[]>`
        SELECT app.set_role_field_permissions(
          ${roleId}::uuid,
          ${permissionsJson}::jsonb,
          ${ctx.userId}::uuid
        ) as count
      `;
      return rows[0]?.count ?? 0;
    });

    return result;
  }

  /**
   * Filter object fields based on user permissions
   * Removes hidden fields from the response
   */
  async filterFields<T extends Record<string, unknown>>(
    ctx: TenantContext,
    entityName: string,
    data: T
  ): Promise<Partial<T>> {
    const permissions = await this.getUserFieldPermissions(ctx);
    const filtered: Partial<T> = {};

    for (const [key, value] of Object.entries(data)) {
      const permKey = `${entityName}.${key}`;
      const perm = permissions.get(permKey)?.permission ?? "hidden";

      // Include field if it's viewable or editable
      if (perm === "view" || perm === "edit") {
        (filtered as Record<string, unknown>)[key] = value;
      }
    }

    return filtered;
  }

  /**
   * Filter array of objects based on permissions
   */
  async filterFieldsArray<T extends Record<string, unknown>>(
    ctx: TenantContext,
    entityName: string,
    data: T[]
  ): Promise<Partial<T>[]> {
    const permissions = await this.getUserFieldPermissions(ctx);

    return data.map((item) => {
      const filtered: Partial<T> = {};

      for (const [key, value] of Object.entries(item)) {
        const permKey = `${entityName}.${key}`;
        const perm = permissions.get(permKey)?.permission ?? "hidden";

        if (perm === "view" || perm === "edit") {
          (filtered as Record<string, unknown>)[key] = value;
        }
      }

      return filtered;
    });
  }

  /**
   * Validate that user can edit the fields they're trying to update
   * Throws error if any field is not editable
   */
  async validateEditableFields(
    ctx: TenantContext,
    entityName: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    const permissions = await this.getUserFieldPermissions(ctx);

    const nonEditableFields: string[] = [];
    for (const fieldName of Object.keys(updates)) {
      const key = `${entityName}.${fieldName}`;
      const perm = permissions.get(key)?.permission;

      if (perm !== "edit") {
        nonEditableFields.push(fieldName);
      }
    }

    if (nonEditableFields.length > 0) {
      throw new FieldPermissionError(
        `Cannot edit fields: ${nonEditableFields.join(", ")}`,
        nonEditableFields
      );
    }
  }

  /**
   * Get writable fields for an entity (for form generation)
   */
  async getEditableFields(
    ctx: TenantContext,
    entityName: string
  ): Promise<string[]> {
    const metadata = await this.getFieldMetadata(ctx, entityName);
    return metadata.filter((f) => f.canEdit).map((f) => f.fieldName);
  }

  /**
   * Get readable fields for an entity
   */
  async getReadableFields(
    ctx: TenantContext,
    entityName: string
  ): Promise<string[]> {
    const metadata = await this.getFieldMetadata(ctx, entityName);
    return metadata.filter((f) => f.canView).map((f) => f.fieldName);
  }

  // =============================================================================
  // Private Helpers
  // =============================================================================

  private mapFieldRow(row: FieldPermissionRow): FieldRegistry {
    return {
      id: row.id,
      entityName: row.entity_name,
      fieldName: row.field_name,
      fieldLabel: row.field_label,
      fieldGroup: row.field_group,
      dataType: row.data_type,
      isSensitive: row.is_sensitive,
      isSystemField: row.is_system_field,
      defaultPermission: row.permission,
      displayOrder: row.display_order,
    };
  }
}

// =============================================================================
// Custom Errors
// =============================================================================

export class FieldPermissionError extends Error {
  constructor(
    message: string,
    public readonly fields: string[]
  ) {
    super(message);
    this.name = "FieldPermissionError";
  }
}
