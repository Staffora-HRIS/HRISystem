/**
 * Portal Module - TypeBox Schemas
 *
 * Defines validation schemas for the self-service portal endpoints,
 * including the employee directory search, department listing, and org chart.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Common
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

// =============================================================================
// Directory Search
// =============================================================================

export const DirectorySearchQuerySchema = t.Object({
  search: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
  departmentId: t.Optional(UuidSchema),
  locationId: t.Optional(UuidSchema),
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 25 })),
});

export type DirectorySearchQuery = Static<typeof DirectorySearchQuerySchema>;

export const DirectoryEmployeeSchema = t.Object({
  id: UuidSchema,
  employeeNumber: t.String(),
  firstName: t.String(),
  lastName: t.String(),
  preferredName: t.Union([t.String(), t.Null()]),
  positionTitle: t.Union([t.String(), t.Null()]),
  departmentId: t.Union([UuidSchema, t.Null()]),
  departmentName: t.Union([t.String(), t.Null()]),
  workEmail: t.Union([t.String(), t.Null()]),
  workPhone: t.Union([t.String(), t.Null()]),
  profilePhotoUrl: t.Union([t.String(), t.Null()]),
  startDate: t.Union([t.String(), t.Null()]),
});

export type DirectoryEmployee = Static<typeof DirectoryEmployeeSchema>;

export const DirectorySearchResponseSchema = t.Object({
  employees: t.Array(DirectoryEmployeeSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type DirectorySearchResponse = Static<typeof DirectorySearchResponseSchema>;

// =============================================================================
// Directory Departments
// =============================================================================

export const DirectoryDepartmentSchema = t.Object({
  id: UuidSchema,
  name: t.String(),
  employeeCount: t.Number(),
});

export type DirectoryDepartment = Static<typeof DirectoryDepartmentSchema>;

export const DirectoryDepartmentsResponseSchema = t.Object({
  departments: t.Array(DirectoryDepartmentSchema),
});

export type DirectoryDepartmentsResponse = Static<typeof DirectoryDepartmentsResponseSchema>;

// =============================================================================
// Directory Configuration (tenant-level)
// =============================================================================

export const DirectoryConfigSchema = t.Object({
  enabled: t.Boolean({ default: true }),
  showWorkEmail: t.Boolean({ default: true }),
  showWorkPhone: t.Boolean({ default: true }),
  showDepartment: t.Boolean({ default: true }),
  showPositionTitle: t.Boolean({ default: true }),
  showStartDate: t.Boolean({ default: false }),
  showProfilePhoto: t.Boolean({ default: true }),
});

export type DirectoryConfig = Static<typeof DirectoryConfigSchema>;

export const DirectoryConfigResponseSchema = t.Object({
  config: DirectoryConfigSchema,
});

export type DirectoryConfigResponse = Static<typeof DirectoryConfigResponseSchema>;

// =============================================================================
// Org Chart
// =============================================================================

/**
 * Query parameters for the org chart endpoint.
 */
export const OrgChartQuerySchema = t.Object({
  /** Root employee UUID. If omitted, starts from top of hierarchy. */
  rootEmployeeId: t.Optional(UuidSchema),
  /** Maximum depth of the tree (1-10, default 3). */
  depth: t.Optional(t.Number({ minimum: 1, maximum: 10, default: 3 })),
});

export type OrgChartQuery = Static<typeof OrgChartQuerySchema>;

/**
 * Response from the org chart endpoint.
 */
export const OrgChartResponseSchema = t.Object({
  roots: t.Array(t.Any()),
  totalEmployees: t.Number(),
});

export type OrgChartResponse = Static<typeof OrgChartResponseSchema>;

/**
 * Path parameter for the team endpoint.
 */
export const OrgChartTeamParamsSchema = t.Object({
  employeeId: UuidSchema,
});

export type OrgChartTeamParams = Static<typeof OrgChartTeamParamsSchema>;

/**
 * A single team member in the direct reports response.
 */
export const OrgChartTeamMemberSchema = t.Object({
  id: UuidSchema,
  name: t.String(),
  jobTitle: t.Union([t.String(), t.Null()]),
  department: t.Union([t.String(), t.Null()]),
  photoUrl: t.Union([t.String(), t.Null()]),
  directReportsCount: t.Number(),
});

export type OrgChartTeamMember = Static<typeof OrgChartTeamMemberSchema>;

/**
 * Response from the team endpoint.
 */
export const OrgChartTeamResponseSchema = t.Object({
  manager: t.Object({
    id: UuidSchema,
    name: t.String(),
    jobTitle: t.Union([t.String(), t.Null()]),
    department: t.Union([t.String(), t.Null()]),
    photoUrl: t.Union([t.String(), t.Null()]),
  }),
  directReports: t.Array(OrgChartTeamMemberSchema),
  count: t.Number(),
});

export type OrgChartTeamResponse = Static<typeof OrgChartTeamResponseSchema>;
