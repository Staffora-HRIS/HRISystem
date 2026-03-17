/**
 * Recognition Module - TypeBox Schemas
 *
 * Validation schemas for peer recognition endpoints.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Shared Schemas
// =============================================================================

export const UuidSchema = t.String({ format: "uuid" });

export const RecognitionCategorySchema = t.Union([
  t.Literal("teamwork"),
  t.Literal("innovation"),
  t.Literal("leadership"),
  t.Literal("service"),
  t.Literal("values"),
]);
export type RecognitionCategory = Static<typeof RecognitionCategorySchema>;

export const RecognitionVisibilitySchema = t.Union([
  t.Literal("public"),
  t.Literal("private"),
  t.Literal("manager_only"),
]);
export type RecognitionVisibility = Static<typeof RecognitionVisibilitySchema>;

// =============================================================================
// Create Recognition
// =============================================================================

export const CreateRecognitionSchema = t.Object({
  toEmployeeId: UuidSchema,
  category: RecognitionCategorySchema,
  message: t.String({ minLength: 1, maxLength: 2000 }),
  visibility: t.Optional(RecognitionVisibilitySchema),
});
export type CreateRecognition = Static<typeof CreateRecognitionSchema>;

// =============================================================================
// Query Schemas
// =============================================================================

export const ListRecognitionsQuerySchema = t.Object({
  category: t.Optional(RecognitionCategorySchema),
  visibility: t.Optional(RecognitionVisibilitySchema),
  toEmployeeId: t.Optional(UuidSchema),
  fromEmployeeId: t.Optional(UuidSchema),
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.String({ pattern: "^[0-9]+$" })),
});
export type ListRecognitionsQuery = Static<typeof ListRecognitionsQuerySchema>;

// =============================================================================
// Response Types
// =============================================================================

export interface RecognitionResponse {
  id: string;
  tenantId: string;
  fromEmployeeId: string;
  toEmployeeId: string;
  fromEmployeeName: string;
  toEmployeeName: string;
  category: string;
  message: string;
  visibility: string;
  createdAt: string;
}

export interface LeaderboardEntry {
  employeeId: string;
  employeeName: string;
  recognitionCount: number;
  topCategory: string | null;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  period: string;
}
