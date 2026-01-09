/**
 * Test Mocks
 *
 * Mock implementations for external services and dependencies.
 * Used for unit testing without real database/Redis connections.
 */

import { mock } from "bun:test";

// =============================================================================
// Types
// =============================================================================

export interface MockDatabaseClient {
  query: ReturnType<typeof mock>;
  begin: ReturnType<typeof mock>;
  end: ReturnType<typeof mock>;
}

export interface MockCacheClient {
  get: ReturnType<typeof mock>;
  set: ReturnType<typeof mock>;
  delete: ReturnType<typeof mock>;
  exists: ReturnType<typeof mock>;
  expire: ReturnType<typeof mock>;
  ttl: ReturnType<typeof mock>;
  keys: ReturnType<typeof mock>;
  flushPattern: ReturnType<typeof mock>;
}

export interface MockRedisClient {
  get: ReturnType<typeof mock>;
  set: ReturnType<typeof mock>;
  del: ReturnType<typeof mock>;
  exists: ReturnType<typeof mock>;
  expire: ReturnType<typeof mock>;
  ttl: ReturnType<typeof mock>;
  keys: ReturnType<typeof mock>;
  scan: ReturnType<typeof mock>;
  xadd: ReturnType<typeof mock>;
  xread: ReturnType<typeof mock>;
  xack: ReturnType<typeof mock>;
  pipeline: ReturnType<typeof mock>;
  disconnect: ReturnType<typeof mock>;
}

export interface MockAuditService {
  log: ReturnType<typeof mock>;
  query: ReturnType<typeof mock>;
}

export interface MockEmailService {
  send: ReturnType<typeof mock>;
  sendTemplate: ReturnType<typeof mock>;
}

export interface MockNotificationService {
  send: ReturnType<typeof mock>;
  sendBatch: ReturnType<typeof mock>;
  markAsRead: ReturnType<typeof mock>;
}

// =============================================================================
// Database Mocks
// =============================================================================

/**
 * Create a mock database client
 */
export function createMockDatabaseClient(): MockDatabaseClient {
  const queryMock = mock(() => Promise.resolve([]));

  const beginMock = mock((callback: (tx: unknown) => Promise<unknown>) => {
    const mockTx = {
      query: queryMock,
    };
    return callback(mockTx);
  });

  return {
    query: queryMock,
    begin: beginMock,
    end: mock(() => Promise.resolve()),
  };
}

/**
 * Create a mock transaction
 */
export function createMockTransaction() {
  return {
    query: mock(() => Promise.resolve([])),
    savepoint: mock(() => Promise.resolve()),
    rollback: mock(() => Promise.resolve()),
  };
}

// =============================================================================
// Cache/Redis Mocks
// =============================================================================

/**
 * Create a mock cache client
 */
export function createMockCacheClient(): MockCacheClient {
  const store = new Map<string, unknown>();

  return {
    get: mock((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: mock((key: string, value: unknown, _ttl?: number) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    delete: mock((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
    exists: mock((key: string) => Promise.resolve(store.has(key))),
    expire: mock(() => Promise.resolve()),
    ttl: mock(() => Promise.resolve(-1)),
    keys: mock((pattern: string) => {
      const regex = new RegExp(pattern.replace(/\*/g, ".*"));
      const keys = Array.from(store.keys()).filter((k) => regex.test(k));
      return Promise.resolve(keys);
    }),
    flushPattern: mock((pattern: string) => {
      const regex = new RegExp(pattern.replace(/\*/g, ".*"));
      for (const key of store.keys()) {
        if (regex.test(key)) {
          store.delete(key);
        }
      }
      return Promise.resolve();
    }),
  };
}

/**
 * Create a mock Redis client
 */
export function createMockRedisClient(): MockRedisClient {
  const store = new Map<string, string>();
  const streams = new Map<string, Array<{ id: string; fields: Record<string, string> }>>();

  return {
    get: mock((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: mock((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve("OK");
    }),
    del: mock((...keys: string[]) => {
      let count = 0;
      for (const key of keys) {
        if (store.delete(key)) count++;
      }
      return Promise.resolve(count);
    }),
    exists: mock((...keys: string[]) => {
      return Promise.resolve(keys.filter((k) => store.has(k)).length);
    }),
    expire: mock(() => Promise.resolve(1)),
    ttl: mock(() => Promise.resolve(-1)),
    keys: mock((pattern: string) => {
      const regex = new RegExp(pattern.replace(/\*/g, ".*"));
      return Promise.resolve(Array.from(store.keys()).filter((k) => regex.test(k)));
    }),
    scan: mock(() => Promise.resolve(["0", []])),
    xadd: mock((stream: string, _id: string, ...fields: string[]) => {
      const entry = { id: `${Date.now()}-0`, fields: {} as Record<string, string> };
      for (let i = 0; i < fields.length; i += 2) {
        entry.fields[fields[i]!] = fields[i + 1]!;
      }
      const streamData = streams.get(stream) ?? [];
      streamData.push(entry);
      streams.set(stream, streamData);
      return Promise.resolve(entry.id);
    }),
    xread: mock(() => Promise.resolve(null)),
    xack: mock(() => Promise.resolve(1)),
    pipeline: mock(() => ({
      exec: mock(() => Promise.resolve([])),
    })),
    disconnect: mock(() => Promise.resolve()),
  };
}

// =============================================================================
// Service Mocks
// =============================================================================

/**
 * Create a mock audit service
 */
export function createMockAuditService(): MockAuditService {
  const logs: Array<{ context: unknown; options: unknown }> = [];

  return {
    log: mock((context: unknown, options: unknown) => {
      logs.push({ context, options });
      return Promise.resolve(crypto.randomUUID());
    }),
    query: mock(() => Promise.resolve(logs)),
  };
}

/**
 * Create a mock email service
 */
export function createMockEmailService(): MockEmailService {
  const sentEmails: Array<{ to: string; subject: string; body: string }> = [];

  return {
    send: mock((to: string, subject: string, body: string) => {
      sentEmails.push({ to, subject, body });
      return Promise.resolve({ messageId: crypto.randomUUID() });
    }),
    sendTemplate: mock((to: string, template: string, data: unknown) => {
      sentEmails.push({ to, subject: template, body: JSON.stringify(data) });
      return Promise.resolve({ messageId: crypto.randomUUID() });
    }),
  };
}

/**
 * Create a mock notification service
 */
export function createMockNotificationService(): MockNotificationService {
  const notifications: Array<{ userId: string; type: string; data: unknown }> = [];

  return {
    send: mock((userId: string, type: string, data: unknown) => {
      notifications.push({ userId, type, data });
      return Promise.resolve(crypto.randomUUID());
    }),
    sendBatch: mock((items: Array<{ userId: string; type: string; data: unknown }>) => {
      notifications.push(...items);
      return Promise.resolve(items.map(() => crypto.randomUUID()));
    }),
    markAsRead: mock(() => Promise.resolve()),
  };
}

// =============================================================================
// Repository Mocks
// =============================================================================

/**
 * Create a mock HR repository
 */
export function createMockHRRepository() {
  const employees = new Map<string, unknown>();
  const orgUnits = new Map<string, unknown>();
  const positions = new Map<string, unknown>();

  return {
    // Employee methods
    findEmployeeById: mock((ctx: unknown, id: string) => 
      Promise.resolve(employees.get(id) ?? null)
    ),
    findEmployees: mock(() => 
      Promise.resolve({ items: Array.from(employees.values()), nextCursor: null, hasMore: false })
    ),
    createEmployee: mock((ctx: unknown, data: unknown) => {
      const id = crypto.randomUUID();
      const employee = { id, ...data as object };
      employees.set(id, employee);
      return Promise.resolve(employee);
    }),
    updateEmployee: mock((ctx: unknown, id: string, data: unknown) => {
      const existing = employees.get(id);
      if (!existing) return Promise.resolve(null);
      const updated = { ...existing as object, ...data as object };
      employees.set(id, updated);
      return Promise.resolve(updated);
    }),

    // Org unit methods
    findOrgUnitById: mock((ctx: unknown, id: string) => 
      Promise.resolve(orgUnits.get(id) ?? null)
    ),
    findOrgUnits: mock(() => 
      Promise.resolve({ items: Array.from(orgUnits.values()), nextCursor: null, hasMore: false })
    ),
    createOrgUnit: mock((ctx: unknown, data: unknown) => {
      const id = crypto.randomUUID();
      const orgUnit = { id, ...data as object };
      orgUnits.set(id, orgUnit);
      return Promise.resolve(orgUnit);
    }),

    // Position methods
    findPositionById: mock((ctx: unknown, id: string) => 
      Promise.resolve(positions.get(id) ?? null)
    ),
    findPositions: mock(() => 
      Promise.resolve({ items: Array.from(positions.values()), nextCursor: null, hasMore: false })
    ),
    createPosition: mock((ctx: unknown, data: unknown) => {
      const id = crypto.randomUUID();
      const position = { id, ...data as object };
      positions.set(id, position);
      return Promise.resolve(position);
    }),

    // Clear all data
    _clear: () => {
      employees.clear();
      orgUnits.clear();
      positions.clear();
    },
  };
}

/**
 * Create a mock absence repository
 */
export function createMockAbsenceRepository() {
  const leaveRequests = new Map<string, unknown>();
  const leaveBalances = new Map<string, unknown>();

  return {
    findLeaveRequestById: mock((ctx: unknown, id: string) => 
      Promise.resolve(leaveRequests.get(id) ?? null)
    ),
    findLeaveRequests: mock(() => 
      Promise.resolve({ items: Array.from(leaveRequests.values()), nextCursor: null, hasMore: false })
    ),
    createLeaveRequest: mock((ctx: unknown, data: unknown) => {
      const id = crypto.randomUUID();
      const request = { id, status: "pending", ...data as object };
      leaveRequests.set(id, request);
      return Promise.resolve(request);
    }),
    updateLeaveRequestStatus: mock((ctx: unknown, id: string, status: string) => {
      const existing = leaveRequests.get(id);
      if (!existing) return Promise.resolve(null);
      const updated = { ...existing as object, status };
      leaveRequests.set(id, updated);
      return Promise.resolve(updated);
    }),
    getLeaveBalance: mock((ctx: unknown, employeeId: string, leaveTypeId: string) => {
      const key = `${employeeId}:${leaveTypeId}`;
      return Promise.resolve(leaveBalances.get(key) ?? null);
    }),
    updateLeaveBalance: mock((ctx: unknown, employeeId: string, leaveTypeId: string, data: unknown) => {
      const key = `${employeeId}:${leaveTypeId}`;
      const existing = leaveBalances.get(key) ?? {};
      const updated = { ...existing as object, ...data as object };
      leaveBalances.set(key, updated);
      return Promise.resolve(updated);
    }),

    _clear: () => {
      leaveRequests.clear();
      leaveBalances.clear();
    },
  };
}

/**
 * Create a mock time repository
 */
export function createMockTimeRepository() {
  const timeEvents = new Map<string, unknown>();
  const timesheets = new Map<string, unknown>();

  return {
    findTimeEventById: mock((ctx: unknown, id: string) => 
      Promise.resolve(timeEvents.get(id) ?? null)
    ),
    findTimeEvents: mock(() => 
      Promise.resolve({ items: Array.from(timeEvents.values()), nextCursor: null, hasMore: false })
    ),
    createTimeEvent: mock((ctx: unknown, data: unknown) => {
      const id = crypto.randomUUID();
      const event = { id, ...data as object };
      timeEvents.set(id, event);
      return Promise.resolve(event);
    }),
    findTimesheetById: mock((ctx: unknown, id: string) => 
      Promise.resolve(timesheets.get(id) ?? null)
    ),
    findTimesheets: mock(() => 
      Promise.resolve({ items: Array.from(timesheets.values()), nextCursor: null, hasMore: false })
    ),
    createTimesheet: mock((ctx: unknown, data: unknown) => {
      const id = crypto.randomUUID();
      const timesheet = { id, status: "draft", ...data as object };
      timesheets.set(id, timesheet);
      return Promise.resolve(timesheet);
    }),

    _clear: () => {
      timeEvents.clear();
      timesheets.clear();
    },
  };
}

// =============================================================================
// Event/Outbox Mocks
// =============================================================================

/**
 * Create a mock outbox for capturing domain events
 */
export function createMockOutbox() {
  const events: Array<{
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: unknown;
  }> = [];

  return {
    emit: mock((aggregateType: string, aggregateId: string, eventType: string, payload: unknown) => {
      events.push({ aggregateType, aggregateId, eventType, payload });
      return Promise.resolve();
    }),
    getEvents: () => [...events],
    getEventsByType: (eventType: string) => events.filter((e) => e.eventType === eventType),
    getEventsByAggregate: (aggregateType: string, aggregateId: string) =>
      events.filter((e) => e.aggregateType === aggregateType && e.aggregateId === aggregateId),
    clear: () => {
      events.length = 0;
    },
  };
}

// =============================================================================
// Request/Response Mocks
// =============================================================================

/**
 * Create a mock request context
 */
export function createMockRequestContext(overrides: Partial<{
  tenantId: string;
  userId: string;
  sessionId: string;
  ipAddress: string;
  userAgent: string;
  requestId: string;
}> = {}) {
  return {
    tenantId: overrides.tenantId ?? crypto.randomUUID(),
    userId: overrides.userId ?? crypto.randomUUID(),
    sessionId: overrides.sessionId ?? crypto.randomUUID(),
    ipAddress: overrides.ipAddress ?? "127.0.0.1",
    userAgent: overrides.userAgent ?? "Test/1.0",
    requestId: overrides.requestId ?? crypto.randomUUID(),
  };
}

/**
 * Create a mock tenant context
 */
export function createMockTenantContext(tenantId?: string, userId?: string) {
  return {
    tenantId: tenantId ?? crypto.randomUUID(),
    userId: userId ?? crypto.randomUUID(),
  };
}
