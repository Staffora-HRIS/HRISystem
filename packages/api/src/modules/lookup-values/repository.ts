/**
 * Lookup Values Module - Repository Layer
 *
 * Database operations for tenant-configurable lookup categories and values.
 * All queries respect RLS via tenant context.
 */

import type {
  CreateCategory,
  UpdateCategory,
  CategoryResponse,
  CreateValue,
  UpdateValue,
  ValueResponse,
} from "./schemas";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

export interface PaginationOptions {
  cursor?: string;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export class LookupValuesRepository {
  constructor(private db: any) {}

  // ===========================================================================
  // Category Operations
  // ===========================================================================

  async listCategories(
    ctx: TenantContext,
    filters: {
      search?: string;
      isActive?: boolean;
    },
    pagination: PaginationOptions
  ): Promise<PaginatedResult<CategoryResponse>> {
    const limit = pagination.limit ?? 50;

    const categories = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            lc.*,
            (SELECT COUNT(*) FROM app.lookup_values lv WHERE lv.category_id = lc.id) as value_count
          FROM app.lookup_categories lc
          WHERE lc.tenant_id = ${ctx.tenantId}::uuid
          ${filters.isActive !== undefined ? tx`AND lc.is_active = ${filters.isActive}` : tx``}
          ${filters.search ? tx`AND (lc.name ILIKE ${"%" + filters.search + "%"} OR lc.code ILIKE ${"%" + filters.search + "%"})` : tx``}
          ${pagination.cursor ? tx`AND lc.id > ${pagination.cursor}::uuid` : tx``}
          ORDER BY lc.name ASC, lc.id ASC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = categories.length > limit;
    const items = hasMore ? categories.slice(0, limit) : categories;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map(this.mapCategoryRow),
      nextCursor,
      hasMore,
    };
  }

  async getCategoryById(
    ctx: TenantContext,
    id: string
  ): Promise<CategoryResponse | null> {
    const [category] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            lc.*,
            (SELECT COUNT(*) FROM app.lookup_values lv WHERE lv.category_id = lc.id) as value_count
          FROM app.lookup_categories lc
          WHERE lc.id = ${id}::uuid AND lc.tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return category ? this.mapCategoryRow(category) : null;
  }

  async getCategoryByCode(
    ctx: TenantContext,
    code: string
  ): Promise<CategoryResponse | null> {
    const [category] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            lc.*,
            (SELECT COUNT(*) FROM app.lookup_values lv WHERE lv.category_id = lc.id) as value_count
          FROM app.lookup_categories lc
          WHERE lc.code = ${code} AND lc.tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return category ? this.mapCategoryRow(category) : null;
  }

  async createCategory(
    ctx: TenantContext,
    data: CreateCategory & { isSystem?: boolean },
    txOverride?: any
  ): Promise<CategoryResponse> {
    const exec = async (tx: any) => {
      return tx`
        INSERT INTO app.lookup_categories (
          id, tenant_id, code, name, description, is_system
        ) VALUES (
          gen_random_uuid(), ${ctx.tenantId}::uuid, ${data.code},
          ${data.name}, ${data.description || null}, ${data.isSystem || false}
        )
        RETURNING *,
          0 as value_count
      `;
    };

    const [category] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return this.mapCategoryRow(category);
  }

  async updateCategory(
    ctx: TenantContext,
    id: string,
    data: UpdateCategory,
    txOverride?: any
  ): Promise<CategoryResponse | null> {
    const exec = async (tx: any) => {
      return tx`
        UPDATE app.lookup_categories SET
          name = COALESCE(${data.name ?? null}, name),
          description = CASE
            WHEN ${data.description !== undefined} THEN ${data.description ?? null}
            ELSE description
          END,
          is_active = COALESCE(${data.isActive ?? null}, is_active),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *,
          (SELECT COUNT(*) FROM app.lookup_values lv WHERE lv.category_id = ${id}::uuid) as value_count
      `;
    };

    const [category] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return category ? this.mapCategoryRow(category) : null;
  }

  async deleteCategory(
    ctx: TenantContext,
    id: string,
    txOverride?: any
  ): Promise<boolean> {
    const exec = async (tx: any) => {
      return tx`
        DELETE FROM app.lookup_categories
        WHERE id = ${id}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
          AND is_system = false
        RETURNING id
      `;
    };

    const result = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return result.length > 0;
  }

  // ===========================================================================
  // Value Operations
  // ===========================================================================

  async listValues(
    ctx: TenantContext,
    categoryId: string,
    filters: {
      search?: string;
      isActive?: boolean;
    },
    pagination: PaginationOptions
  ): Promise<PaginatedResult<ValueResponse>> {
    const limit = pagination.limit ?? 100;

    const values = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            lv.*,
            lc.code as category_code
          FROM app.lookup_values lv
          JOIN app.lookup_categories lc ON lc.id = lv.category_id
          WHERE lv.category_id = ${categoryId}::uuid
            AND lv.tenant_id = ${ctx.tenantId}::uuid
          ${filters.isActive !== undefined ? tx`AND lv.is_active = ${filters.isActive}` : tx``}
          ${filters.search ? tx`AND (lv.label ILIKE ${"%" + filters.search + "%"} OR lv.code ILIKE ${"%" + filters.search + "%"})` : tx``}
          ${pagination.cursor ? tx`AND lv.id > ${pagination.cursor}::uuid` : tx``}
          ORDER BY lv.sort_order ASC, lv.label ASC, lv.id ASC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = values.length > limit;
    const items = hasMore ? values.slice(0, limit) : values;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map(this.mapValueRow),
      nextCursor,
      hasMore,
    };
  }

  async getValuesByCategoryCode(
    ctx: TenantContext,
    categoryCode: string,
    activeOnly: boolean = true
  ): Promise<ValueResponse[]> {
    const values = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            lv.*,
            lc.code as category_code
          FROM app.lookup_values lv
          JOIN app.lookup_categories lc ON lc.id = lv.category_id
          WHERE lc.code = ${categoryCode}
            AND lv.tenant_id = ${ctx.tenantId}::uuid
          ${activeOnly ? tx`AND lv.is_active = true AND lc.is_active = true` : tx``}
          ORDER BY lv.sort_order ASC, lv.label ASC
        `;
      }
    );

    return values.map(this.mapValueRow);
  }

  async getValueById(
    ctx: TenantContext,
    valueId: string
  ): Promise<ValueResponse | null> {
    const [value] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            lv.*,
            lc.code as category_code
          FROM app.lookup_values lv
          JOIN app.lookup_categories lc ON lc.id = lv.category_id
          WHERE lv.id = ${valueId}::uuid AND lv.tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return value ? this.mapValueRow(value) : null;
  }

  async createValue(
    ctx: TenantContext,
    categoryId: string,
    data: CreateValue,
    txOverride?: any
  ): Promise<ValueResponse> {
    const exec = async (tx: any) => {
      return tx`
        INSERT INTO app.lookup_values (
          id, tenant_id, category_id, code, label, description,
          sort_order, is_default, metadata
        ) VALUES (
          gen_random_uuid(), ${ctx.tenantId}::uuid, ${categoryId}::uuid,
          ${data.code}, ${data.label}, ${data.description || null},
          ${data.sortOrder ?? 0}, ${data.isDefault || false},
          ${data.metadata ? JSON.stringify(data.metadata) : null}::jsonb
        )
        RETURNING *,
          (SELECT code FROM app.lookup_categories WHERE id = ${categoryId}::uuid) as category_code
      `;
    };

    const [value] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return this.mapValueRow(value);
  }

  async updateValue(
    ctx: TenantContext,
    valueId: string,
    data: UpdateValue,
    txOverride?: any
  ): Promise<ValueResponse | null> {
    const exec = async (tx: any) => {
      return tx`
        UPDATE app.lookup_values SET
          label = COALESCE(${data.label ?? null}, label),
          description = CASE
            WHEN ${data.description !== undefined} THEN ${data.description ?? null}
            ELSE description
          END,
          sort_order = COALESCE(${data.sortOrder ?? null}, sort_order),
          is_default = COALESCE(${data.isDefault ?? null}, is_default),
          is_active = COALESCE(${data.isActive ?? null}, is_active),
          metadata = CASE
            WHEN ${data.metadata !== undefined} THEN ${data.metadata ? JSON.stringify(data.metadata) : null}::jsonb
            ELSE metadata
          END,
          updated_at = now()
        WHERE id = ${valueId}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *,
          (SELECT code FROM app.lookup_categories WHERE id = category_id) as category_code
      `;
    };

    const [value] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return value ? this.mapValueRow(value) : null;
  }

  async deleteValue(
    ctx: TenantContext,
    valueId: string,
    txOverride?: any
  ): Promise<boolean> {
    const exec = async (tx: any) => {
      return tx`
        DELETE FROM app.lookup_values
        WHERE id = ${valueId}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING id
      `;
    };

    const result = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return result.length > 0;
  }

  async checkValueCodeExists(
    ctx: TenantContext,
    categoryId: string,
    code: string,
    excludeValueId?: string
  ): Promise<boolean> {
    const [result] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT 1 FROM app.lookup_values
          WHERE category_id = ${categoryId}::uuid
            AND code = ${code}
            AND tenant_id = ${ctx.tenantId}::uuid
            ${excludeValueId ? tx`AND id != ${excludeValueId}::uuid` : tx``}
          LIMIT 1
        `;
      }
    );

    return !!result;
  }

  // ===========================================================================
  // Seed Operations
  // ===========================================================================

  async seedSystemCategories(
    ctx: TenantContext,
    categories: ReadonlyArray<{
      code: string;
      name: string;
      description?: string;
      values: ReadonlyArray<{ code: string; label: string; sortOrder: number }>;
    }>,
    txOverride?: any
  ): Promise<void> {
    const exec = async (tx: any) => {
      for (const cat of categories) {
        // Upsert category
        const [category] = await tx`
          INSERT INTO app.lookup_categories (id, tenant_id, code, name, description, is_system)
          VALUES (gen_random_uuid(), ${ctx.tenantId}::uuid, ${cat.code}, ${cat.name}, ${cat.description || null}, true)
          ON CONFLICT (tenant_id, code) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description
          RETURNING id
        `;

        // Upsert values
        for (const val of cat.values) {
          await tx`
            INSERT INTO app.lookup_values (id, tenant_id, category_id, code, label, sort_order)
            VALUES (gen_random_uuid(), ${ctx.tenantId}::uuid, ${category.id}::uuid, ${val.code}, ${val.label}, ${val.sortOrder})
            ON CONFLICT (category_id, code) DO UPDATE SET
              label = EXCLUDED.label,
              sort_order = EXCLUDED.sort_order
          `;
        }
      }
    };

    if (txOverride) {
      await exec(txOverride);
    } else {
      await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        exec
      );
    }
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private mapCategoryRow(row: any): CategoryResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      code: row.code,
      name: row.name,
      description: row.description ?? null,
      isSystem: row.isSystem,
      isActive: row.isActive,
      valueCount: Number(row.valueCount) || 0,
      createdAt: row.createdAt?.toISOString?.() ?? String(row.createdAt),
      updatedAt: row.updatedAt?.toISOString?.() ?? String(row.updatedAt),
    };
  }

  private mapValueRow(row: any): ValueResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      categoryId: row.categoryId,
      categoryCode: row.categoryCode ?? undefined,
      code: row.code,
      label: row.label,
      description: row.description ?? null,
      sortOrder: Number(row.sortOrder) || 0,
      isDefault: row.isDefault,
      isActive: row.isActive,
      metadata: row.metadata ?? null,
      createdAt: row.createdAt?.toISOString?.() ?? String(row.createdAt),
      updatedAt: row.updatedAt?.toISOString?.() ?? String(row.updatedAt),
    };
  }
}
