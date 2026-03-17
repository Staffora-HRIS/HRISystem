/**
 * Test Data Factories
 *
 * Provides factory functions for generating test data.
 * Uses faker for realistic data generation.
 */

import { faker } from "@faker-js/faker";

// =============================================================================
// Types
// =============================================================================

export interface TenantData {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export interface UserData {
  id: string;
  email: string;
  tenantId: string;
  status: string;
  emailVerified: boolean;
}

export interface EmployeeData {
  id: string;
  tenantId: string;
  employeeNumber: string;
  status: "pending" | "active" | "on_leave" | "terminated";
  hireDate: string;
  terminationDate: string | null;
  terminationReason: string | null;
}

export interface EmployeePersonalData {
  id: string;
  tenantId: string;
  employeeId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  preferredName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  maritalStatus: string | null;
  nationality: string | null;
}

export interface OrgUnitData {
  id: string;
  tenantId: string;
  parentId: string | null;
  code: string;
  name: string;
  description: string | null;
  level: number;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface PositionData {
  id: string;
  tenantId: string;
  orgUnitId: string | null;
  code: string;
  title: string;
  description: string | null;
  jobGrade: string | null;
  minSalary: string | null;
  maxSalary: string | null;
  currency: string;
  isManager: boolean;
  headcount: number;
  isActive: boolean;
}

export interface LeaveTypeData {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  defaultDays: number;
  carryOverDays: number;
  requiresApproval: boolean;
  isPaid: boolean;
  isActive: boolean;
}

export interface LeaveRequestData {
  id: string;
  tenantId: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reason: string | null;
  requestedDays: number;
}

export interface LeaveBalanceData {
  id: string;
  tenantId: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  entitled: number;
  used: number;
  pending: number;
  carriedOver: number;
}

export interface TimeEventData {
  id: string;
  tenantId: string;
  employeeId: string;
  eventType: "clock_in" | "clock_out" | "break_start" | "break_end";
  timestamp: string;
  source: "web" | "mobile" | "terminal" | "manual";
  latitude: number | null;
  longitude: number | null;
}

export interface TimesheetData {
  id: string;
  tenantId: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
}

export interface RoleData {
  id: string;
  tenantId: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
}

export interface PermissionData {
  id: string;
  resource: string;
  action: string;
  permissionKey: string;
  description: string | null;
  requiresMfa: boolean;
}

export interface SessionData {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

// =============================================================================
// Factory Functions
// =============================================================================

export const factories = {
  /**
   * Generate tenant data
   */
  tenant: (overrides: Partial<TenantData> = {}): TenantData => ({
    id: crypto.randomUUID(),
    name: faker.company.name(),
    slug: faker.helpers.slugify(faker.company.name()).toLowerCase().slice(0, 50),
    status: "active",
    ...overrides,
  }),

  /**
   * Generate user data
   */
  user: (tenantId: string, overrides: Partial<UserData> = {}): UserData => ({
    id: crypto.randomUUID(),
    email: faker.internet.email().toLowerCase(),
    tenantId,
    status: "active",
    emailVerified: true,
    ...overrides,
  }),

  /**
   * Generate employee data
   */
  employee: (tenantId: string, overrides: Partial<EmployeeData> = {}): EmployeeData => ({
    id: crypto.randomUUID(),
    tenantId,
    employeeNumber: `EMP-${faker.string.numeric(6)}`,
    status: "active",
    hireDate: faker.date.past({ years: 2 }).toISOString().split("T")[0]!,
    terminationDate: null,
    terminationReason: null,
    ...overrides,
  }),

  /**
   * Generate employee personal data
   */
  employeePersonal: (
    tenantId: string,
    employeeId: string,
    overrides: Partial<EmployeePersonalData> = {}
  ): EmployeePersonalData => ({
    id: crypto.randomUUID(),
    tenantId,
    employeeId,
    effectiveFrom: faker.date.past({ years: 2 }).toISOString().split("T")[0]!,
    effectiveTo: null,
    firstName: faker.person.firstName(),
    middleName: faker.helpers.maybe(() => faker.person.middleName()) ?? null,
    lastName: faker.person.lastName(),
    preferredName: faker.helpers.maybe(() => faker.person.firstName()) ?? null,
    dateOfBirth: faker.date.birthdate({ min: 18, max: 65, mode: "age" }).toISOString().split("T")[0] ?? null,
    gender: faker.helpers.arrayElement(["male", "female", "other", null]),
    maritalStatus: faker.helpers.arrayElement(["single", "married", "divorced", "widowed", null]),
    nationality: faker.location.countryCode(),
    ...overrides,
  }),

  /**
   * Generate org unit data
   */
  orgUnit: (tenantId: string, overrides: Partial<OrgUnitData> = {}): OrgUnitData => ({
    id: crypto.randomUUID(),
    tenantId,
    parentId: null,
    code: `ORG-${faker.string.alphanumeric(4).toUpperCase()}`,
    name: faker.commerce.department(),
    description: faker.lorem.sentence(),
    level: 1,
    isActive: true,
    effectiveFrom: faker.date.past({ years: 1 }).toISOString().split("T")[0]!,
    effectiveTo: null,
    ...overrides,
  }),

  /**
   * Generate position data
   */
  position: (
    tenantId: string,
    orgUnitId: string | null = null,
    overrides: Partial<PositionData> = {}
  ): PositionData => ({
    id: crypto.randomUUID(),
    tenantId,
    orgUnitId,
    code: `POS-${faker.string.alphanumeric(4).toUpperCase()}`,
    title: faker.person.jobTitle(),
    description: faker.lorem.sentence(),
    jobGrade: faker.helpers.arrayElement(["L1", "L2", "L3", "L4", "L5", "M1", "M2", "M3"]),
    minSalary: faker.number.int({ min: 30000, max: 50000 }).toString(),
    maxSalary: faker.number.int({ min: 60000, max: 150000 }).toString(),
    currency: "GBP",
    isManager: faker.datatype.boolean(),
    headcount: faker.number.int({ min: 1, max: 10 }),
    isActive: true,
    ...overrides,
  }),

  /**
   * Generate leave type data
   */
  leaveType: (tenantId: string, overrides: Partial<LeaveTypeData> = {}): LeaveTypeData => ({
    id: crypto.randomUUID(),
    tenantId,
    code: faker.helpers.arrayElement(["ANNUAL", "SICK", "PERSONAL", "MATERNITY", "PATERNITY"]),
    name: faker.helpers.arrayElement(["Annual Leave", "Sick Leave", "Personal Leave", "Maternity Leave", "Paternity Leave"]),
    description: faker.lorem.sentence(),
    defaultDays: faker.number.int({ min: 5, max: 30 }),
    carryOverDays: faker.number.int({ min: 0, max: 10 }),
    requiresApproval: true,
    isPaid: true,
    isActive: true,
    ...overrides,
  }),

  /**
   * Generate leave request data
   */
  leaveRequest: (
    tenantId: string,
    employeeId: string,
    leaveTypeId: string,
    overrides: Partial<LeaveRequestData> = {}
  ): LeaveRequestData => {
    const startDate = faker.date.future({ years: 1 });
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + faker.number.int({ min: 1, max: 10 }));

    return {
      id: crypto.randomUUID(),
      tenantId,
      employeeId,
      leaveTypeId,
      startDate: startDate.toISOString().split("T")[0]!,
      endDate: endDate.toISOString().split("T")[0]!,
      status: "pending",
      reason: faker.lorem.sentence(),
      requestedDays: faker.number.int({ min: 1, max: 10 }),
      ...overrides,
    };
  },

  /**
   * Generate leave balance data
   */
  leaveBalance: (
    tenantId: string,
    employeeId: string,
    leaveTypeId: string,
    overrides: Partial<LeaveBalanceData> = {}
  ): LeaveBalanceData => ({
    id: crypto.randomUUID(),
    tenantId,
    employeeId,
    leaveTypeId,
    year: new Date().getFullYear(),
    entitled: faker.number.int({ min: 15, max: 30 }),
    used: faker.number.int({ min: 0, max: 10 }),
    pending: faker.number.int({ min: 0, max: 5 }),
    carriedOver: faker.number.int({ min: 0, max: 5 }),
    ...overrides,
  }),

  /**
   * Generate time event data
   */
  timeEvent: (
    tenantId: string,
    employeeId: string,
    overrides: Partial<TimeEventData> = {}
  ): TimeEventData => ({
    id: crypto.randomUUID(),
    tenantId,
    employeeId,
    eventType: faker.helpers.arrayElement(["clock_in", "clock_out", "break_start", "break_end"]),
    timestamp: faker.date.recent({ days: 7 }).toISOString(),
    source: faker.helpers.arrayElement(["web", "mobile", "terminal", "manual"]),
    latitude: faker.helpers.maybe(() => faker.location.latitude()) ?? null,
    longitude: faker.helpers.maybe(() => faker.location.longitude()) ?? null,
    ...overrides,
  }),

  /**
   * Generate timesheet data
   */
  timesheet: (
    tenantId: string,
    employeeId: string,
    overrides: Partial<TimesheetData> = {}
  ): TimesheetData => {
    const periodStart = faker.date.recent({ days: 14 });
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + 6);

    const regularHours = faker.number.int({ min: 35, max: 40 });
    const overtimeHours = faker.number.int({ min: 0, max: 10 });

    return {
      id: crypto.randomUUID(),
      tenantId,
      employeeId,
      periodStart: periodStart.toISOString().split("T")[0]!,
      periodEnd: periodEnd.toISOString().split("T")[0]!,
      status: "draft",
      totalHours: regularHours + overtimeHours,
      regularHours,
      overtimeHours,
      ...overrides,
    };
  },

  /**
   * Generate role data
   */
  role: (tenantId: string | null, overrides: Partial<RoleData> = {}): RoleData => ({
    id: crypto.randomUUID(),
    tenantId,
    name: faker.person.jobType(),
    description: faker.lorem.sentence(),
    isSystem: false,
    ...overrides,
  }),

  /**
   * Generate permission data
   */
  permission: (overrides: Partial<PermissionData> = {}): PermissionData => {
    const resource = faker.helpers.arrayElement(["employees", "org_units", "positions", "leave_requests", "timesheets"]);
    const action = faker.helpers.arrayElement(["create", "read", "update", "delete", "approve"]);

    return {
      id: crypto.randomUUID(),
      resource,
      action,
      permissionKey: `${resource}:${action}`,
      description: `${action} ${resource}`,
      requiresMfa: false,
      ...overrides,
    };
  },

  /**
   * Generate session data
   */
  session: (userId: string, overrides: Partial<SessionData> = {}): SessionData => {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    return {
      id: crypto.randomUUID(),
      userId,
      token: faker.string.alphanumeric(64),
      expiresAt: expiresAt.toISOString(),
      ipAddress: faker.internet.ip(),
      userAgent: faker.internet.userAgent(),
      ...overrides,
    };
  },
};

// =============================================================================
// Bulk Data Generation
// =============================================================================

/**
 * Generate multiple items using a factory
 */
export function generateMany<T>(
  factory: () => T,
  count: number
): T[] {
  return Array.from({ length: count }, () => factory());
}

/**
 * Seed data for performance testing
 */
export interface SeedConfig {
  tenants: number;
  employeesPerTenant: number;
  leaveRequestsPerEmployee: number;
  timeEventsPerEmployee: number;
}

export async function generateSeedData(config: SeedConfig): Promise<{
  tenants: TenantData[];
  employees: Map<string, EmployeeData[]>;
  leaveRequests: Map<string, LeaveRequestData[]>;
  timeEvents: Map<string, TimeEventData[]>;
}> {
  const tenants = generateMany(() => factories.tenant(), config.tenants);
  const employees = new Map<string, EmployeeData[]>();
  const leaveRequests = new Map<string, LeaveRequestData[]>();
  const timeEvents = new Map<string, TimeEventData[]>();

  for (const tenant of tenants) {
    const tenantEmployees = generateMany(
      () => factories.employee(tenant.id),
      config.employeesPerTenant
    );
    employees.set(tenant.id, tenantEmployees);

    const tenantLeaveRequests: LeaveRequestData[] = [];
    const tenantTimeEvents: TimeEventData[] = [];

    for (const employee of tenantEmployees) {
      const leaveTypeId = crypto.randomUUID();
      
      for (let i = 0; i < config.leaveRequestsPerEmployee; i++) {
        tenantLeaveRequests.push(
          factories.leaveRequest(tenant.id, employee.id, leaveTypeId)
        );
      }

      for (let i = 0; i < config.timeEventsPerEmployee; i++) {
        tenantTimeEvents.push(factories.timeEvent(tenant.id, employee.id));
      }
    }

    leaveRequests.set(tenant.id, tenantLeaveRequests);
    timeEvents.set(tenant.id, tenantTimeEvents);
  }

  return { tenants, employees, leaveRequests, timeEvents };
}
