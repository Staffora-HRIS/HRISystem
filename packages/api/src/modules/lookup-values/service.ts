/**
 * Lookup Values Module - Service Layer
 *
 * Business logic for tenant-configurable lookup categories and values.
 * Handles validation, domain events, and seed operations.
 */

import type { TransactionSql } from "postgres";
import {
  LookupValuesRepository,
  type TenantContext,
  type PaginationOptions,
} from "./repository";
import type {
  CreateCategory,
  UpdateCategory,
  CategoryResponse,
  CreateValue,
  UpdateValue,
  ValueResponse,
} from "./schemas";
import { SYSTEM_CATEGORIES } from "./schemas";
import type { ServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";

export class LookupValuesService {
  constructor(
    private repository: LookupValuesRepository,
    private db: any
  ) {}

  // ===========================================================================
  // Category Operations
  // ===========================================================================

  async listCategories(
    ctx: TenantContext,
    filters: { search?: string; isActive?: boolean },
    pagination: PaginationOptions
  ) {
    return this.repository.listCategories(ctx, filters, pagination);
  }

  async getCategory(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<CategoryResponse>> {
    const category = await this.repository.getCategoryById(ctx, id);

    if (!category) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Lookup category not found",
        },
      };
    }

    return { success: true, data: category };
  }

  async getCategoryByCode(
    ctx: TenantContext,
    code: string
  ): Promise<ServiceResult<CategoryResponse>> {
    const category = await this.repository.getCategoryByCode(ctx, code);

    if (!category) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Lookup category with code '${code}' not found`,
        },
      };
    }

    return { success: true, data: category };
  }

  async createCategory(
    ctx: TenantContext,
    data: CreateCategory
  ): Promise<ServiceResult<CategoryResponse>> {
    // Check for duplicate code
    const existing = await this.repository.getCategoryByCode(ctx, data.code);
    if (existing) {
      return {
        success: false,
        error: {
          code: "DUPLICATE_CODE",
          message: `A category with code '${data.code}' already exists`,
        },
      };
    }

    try {
      const category = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createCategory(ctx, data, tx);

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "lookup_category",
            aggregateId: result.id,
            eventType: "lookup.category.created",
            payload: {
              category: result,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: category };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "CREATE_FAILED",
          message: error.message || "Failed to create lookup category",
        },
      };
    }
  }

  async updateCategory(
    ctx: TenantContext,
    id: string,
    data: UpdateCategory
  ): Promise<ServiceResult<CategoryResponse>> {
    const existing = await this.repository.getCategoryById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Lookup category not found",
        },
      };
    }

    try {
      const category = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateCategory(ctx, id, data, tx);

          if (!result) return null;

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "lookup_category",
            aggregateId: id,
            eventType: "lookup.category.updated",
            payload: {
              category: result,
              changes: data,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!category) {
        return {
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message: "Failed to update lookup category",
          },
        };
      }

      return { success: true, data: category };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: error.message || "Failed to update lookup category",
        },
      };
    }
  }

  async deleteCategory(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<{ success: true; message: string }>> {
    const existing = await this.repository.getCategoryById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Lookup category not found",
        },
      };
    }

    if (existing.isSystem) {
      return {
        success: false,
        error: {
          code: ErrorCodes.FORBIDDEN,
          message: "System categories cannot be deleted",
        },
      };
    }

    try {
      const deleted = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.deleteCategory(ctx, id, tx);

          if (result) {
            await this.emitDomainEvent(tx, ctx, {
              aggregateType: "lookup_category",
              aggregateId: id,
              eventType: "lookup.category.deleted",
              payload: {
                categoryId: id,
                categoryCode: existing.code,
                actor: ctx.userId,
              },
            });
          }

          return result;
        }
      );

      if (!deleted) {
        return {
          success: false,
          error: {
            code: "DELETE_FAILED",
            message: "Failed to delete lookup category",
          },
        };
      }

      return {
        success: true,
        data: { success: true as const, message: "Category deleted successfully" },
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "DELETE_FAILED",
          message: error.message || "Failed to delete lookup category",
        },
      };
    }
  }

  // ===========================================================================
  // Value Operations
  // ===========================================================================

  async listValues(
    ctx: TenantContext,
    categoryId: string,
    filters: { search?: string; isActive?: boolean },
    pagination: PaginationOptions
  ) {
    // Verify category exists
    const category = await this.repository.getCategoryById(ctx, categoryId);
    if (!category) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    return this.repository.listValues(ctx, categoryId, filters, pagination);
  }

  async getValuesByCode(
    ctx: TenantContext,
    categoryCode: string,
    activeOnly: boolean = true
  ): Promise<ValueResponse[]> {
    return this.repository.getValuesByCategoryCode(ctx, categoryCode, activeOnly);
  }

  async getValue(
    ctx: TenantContext,
    valueId: string
  ): Promise<ServiceResult<ValueResponse>> {
    const value = await this.repository.getValueById(ctx, valueId);

    if (!value) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Lookup value not found",
        },
      };
    }

    return { success: true, data: value };
  }

  async createValue(
    ctx: TenantContext,
    categoryId: string,
    data: CreateValue
  ): Promise<ServiceResult<ValueResponse>> {
    // Verify category exists
    const category = await this.repository.getCategoryById(ctx, categoryId);
    if (!category) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Lookup category not found",
        },
      };
    }

    // Check for duplicate code within the category
    const codeExists = await this.repository.checkValueCodeExists(
      ctx,
      categoryId,
      data.code
    );
    if (codeExists) {
      return {
        success: false,
        error: {
          code: "DUPLICATE_CODE",
          message: `A value with code '${data.code}' already exists in this category`,
        },
      };
    }

    try {
      const value = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createValue(
            ctx,
            categoryId,
            data,
            tx
          );

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "lookup_value",
            aggregateId: result.id,
            eventType: "lookup.value.created",
            payload: {
              value: result,
              categoryId,
              categoryCode: category.code,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: value };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "CREATE_FAILED",
          message: error.message || "Failed to create lookup value",
        },
      };
    }
  }

  async updateValue(
    ctx: TenantContext,
    valueId: string,
    data: UpdateValue
  ): Promise<ServiceResult<ValueResponse>> {
    const existing = await this.repository.getValueById(ctx, valueId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Lookup value not found",
        },
      };
    }

    try {
      const value = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateValue(ctx, valueId, data, tx);

          if (!result) return null;

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "lookup_value",
            aggregateId: valueId,
            eventType: "lookup.value.updated",
            payload: {
              value: result,
              changes: data,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!value) {
        return {
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message: "Failed to update lookup value",
          },
        };
      }

      return { success: true, data: value };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: error.message || "Failed to update lookup value",
        },
      };
    }
  }

  async deleteValue(
    ctx: TenantContext,
    valueId: string
  ): Promise<ServiceResult<{ success: true; message: string }>> {
    const existing = await this.repository.getValueById(ctx, valueId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Lookup value not found",
        },
      };
    }

    try {
      const deleted = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.deleteValue(ctx, valueId, tx);

          if (result) {
            await this.emitDomainEvent(tx, ctx, {
              aggregateType: "lookup_value",
              aggregateId: valueId,
              eventType: "lookup.value.deleted",
              payload: {
                valueId,
                categoryId: existing.categoryId,
                valueCode: existing.code,
                actor: ctx.userId,
              },
            });
          }

          return result;
        }
      );

      if (!deleted) {
        return {
          success: false,
          error: {
            code: "DELETE_FAILED",
            message: "Failed to delete lookup value",
          },
        };
      }

      return {
        success: true,
        data: { success: true as const, message: "Value deleted successfully" },
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "DELETE_FAILED",
          message: error.message || "Failed to delete lookup value",
        },
      };
    }
  }

  // ===========================================================================
  // Seed Operations
  // ===========================================================================

  async seedDefaults(
    ctx: TenantContext
  ): Promise<ServiceResult<{ seeded: number }>> {
    try {
      await this.repository.seedSystemCategories(ctx, SYSTEM_CATEGORIES);
      return {
        success: true,
        data: { seeded: SYSTEM_CATEGORIES.length },
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "SEED_FAILED",
          message: error.message || "Failed to seed default lookup values",
        },
      };
    }
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private async emitDomainEvent(
    tx: TransactionSql,
    ctx: TenantContext,
    event: {
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      payload: Record<string, unknown>;
    }
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at
      ) VALUES (
        gen_random_uuid(), ${ctx.tenantId}::uuid, ${event.aggregateType},
        ${event.aggregateId}::uuid, ${event.eventType},
        ${JSON.stringify(event.payload)}::jsonb, now()
      )
    `;
  }
}
