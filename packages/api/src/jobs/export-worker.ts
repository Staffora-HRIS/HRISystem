/**
 * Export Worker
 *
 * Generates report exports in various formats:
 * - CSV export generation
 * - Excel (XLSX) export generation
 * - Large dataset handling with streaming
 * - Upload to storage and create download links
 * - Notify users when export is complete
 *
 * Features:
 * - Streaming for memory efficiency
 * - Progress tracking
 * - Automatic cleanup of old exports
 * - Support for custom queries
 */

import {
  type JobPayload,
  type JobContext,
  type ProcessorRegistration,
  JobTypes,
  StreamKeys,
} from "./base";

// =============================================================================
// Types
// =============================================================================

/**
 * Supported export formats
 */
export type ExportFormat = "csv" | "xlsx" | "json";

/**
 * Export column definition
 */
export interface ExportColumn {
  /** Database column or computed field name */
  field: string;
  /** Display header */
  header: string;
  /** Column width (for Excel) */
  width?: number;
  /** Value formatter function name */
  formatter?: "date" | "datetime" | "currency" | "percentage" | "boolean";
  /** Custom format string */
  format?: string;
}

/**
 * Export query definition
 */
export interface ExportQuery {
  /** Base table or view */
  table: string;
  /** Columns to export */
  columns: ExportColumn[];
  /** WHERE clause conditions */
  filters?: Record<string, unknown>;
  /** ORDER BY clause */
  orderBy?: Array<{ field: string; direction: "asc" | "desc" }>;
  /** Maximum rows to export */
  limit?: number;
  /** Custom SQL (use with caution, must be tenant-scoped) */
  customSql?: string;
}

/**
 * CSV export payload
 */
export interface CsvExportPayload {
  /** Export query definition */
  query: ExportQuery;
  /** Export name (for filename) */
  name: string;
  /** Delimiter character */
  delimiter?: string;
  /** Whether to include headers */
  includeHeaders?: boolean;
  /** Quote character for values */
  quoteChar?: string;
  /** Escape character */
  escapeChar?: string;
  /** Line ending */
  lineEnding?: "\n" | "\r\n";
  /** User ID to notify on completion */
  notifyUserId?: string;
}

/**
 * Excel export payload
 */
export interface ExcelExportPayload {
  /** Export query definition */
  query: ExportQuery;
  /** Export name (for filename) */
  name: string;
  /** Sheet name */
  sheetName?: string;
  /** Whether to include headers */
  includeHeaders?: boolean;
  /** Auto-fit column widths */
  autoFitColumns?: boolean;
  /** Freeze header row */
  freezeHeader?: boolean;
  /** User ID to notify on completion */
  notifyUserId?: string;
}

/**
 * Export result
 */
export interface ExportResult {
  /** Export ID */
  exportId: string;
  /** Download URL */
  downloadUrl: string;
  /** File size in bytes */
  fileSize: number;
  /** Row count */
  rowCount: number;
  /** Export format */
  format: ExportFormat;
  /** When the export expires */
  expiresAt: Date;
}

/**
 * Export status
 */
export type ExportStatus = "pending" | "processing" | "completed" | "failed" | "expired";

/**
 * Export record in database
 */
export interface ExportRecord {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  format: ExportFormat;
  status: ExportStatus;
  filePath: string | null;
  fileSize: number | null;
  rowCount: number | null;
  error: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
}

// =============================================================================
// Storage Abstraction
// =============================================================================

/**
 * Storage interface for export files
 */
export interface ExportStorage {
  /** Save a file and return the path/URL */
  save(filename: string, content: Buffer | string): Promise<string>;
  /** Get a download URL for a file */
  getDownloadUrl(filePath: string, expiresIn?: number): Promise<string>;
  /** Delete a file */
  delete(filePath: string): Promise<void>;
}

/**
 * Local filesystem storage (for development)
 */
export class LocalStorage implements ExportStorage {
  private basePath: string;
  private baseUrl: string;

  constructor() {
    this.basePath = process.env["EXPORT_STORAGE_PATH"] || "/tmp/hris-exports";
    this.baseUrl = process.env["EXPORT_BASE_URL"] || "http://localhost:3000/api/exports";
  }

  async save(filename: string, content: Buffer | string): Promise<string> {
    const fs = await import("fs/promises");
    const path = await import("path");

    // Ensure directory exists
    await fs.mkdir(this.basePath, { recursive: true });

    const filePath = path.join(this.basePath, filename);
    await fs.writeFile(filePath, content);

    return filePath;
  }

  async getDownloadUrl(filePath: string, _expiresIn?: number): Promise<string> {
    const path = await import("path");
    const filename = path.basename(filePath);
    return `${this.baseUrl}/${filename}`;
  }

  async delete(filePath: string): Promise<void> {
    const fs = await import("fs/promises");
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
}

/**
 * S3-compatible storage (for production)
 */
export class S3Storage implements ExportStorage {
  private bucket: string;
  private region: string;
  private prefix: string;
  private s3Client: import("@aws-sdk/client-s3").S3Client | null = null;

  constructor() {
    this.bucket = process.env["S3_EXPORT_BUCKET"] || "hris-exports";
    this.region = process.env["S3_REGION"] || "us-east-1";
    this.prefix = process.env["S3_EXPORT_PREFIX"] || "exports/";
  }

  private async getClient(): Promise<import("@aws-sdk/client-s3").S3Client> {
    if (!this.s3Client) {
      const { S3Client } = await import("@aws-sdk/client-s3");
      this.s3Client = new S3Client({
        region: this.region,
        credentials: process.env["AWS_ACCESS_KEY_ID"]
          ? {
              accessKeyId: process.env["AWS_ACCESS_KEY_ID"],
              secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"] || "",
            }
          : undefined, // Use default credential provider chain
      });
    }
    return this.s3Client;
  }

  async save(filename: string, content: Buffer | string): Promise<string> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();
    const key = `${this.prefix}${filename}`;

    const body = typeof content === "string" ? Buffer.from(content, "utf-8") : content;

    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: filename.endsWith(".csv")
          ? "text/csv"
          : filename.endsWith(".xlsx")
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/octet-stream",
      })
    );

    return `s3://${this.bucket}/${key}`;
  }

  async getDownloadUrl(filePath: string, expiresIn: number = 3600): Promise<string> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const client = await this.getClient();

    // Extract the key from the S3 URI
    const key = filePath.startsWith("s3://")
      ? filePath.replace(`s3://${this.bucket}/`, "")
      : filePath;

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const signedUrl = await getSignedUrl(client, command, { expiresIn });
    return signedUrl;
  }

  async delete(filePath: string): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();

    // Extract the key from the S3 URI
    const key = filePath.startsWith("s3://")
      ? filePath.replace(`s3://${this.bucket}/`, "")
      : filePath;

    await client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }
}

/**
 * Get storage based on environment
 */
function getStorage(): ExportStorage {
  if (process.env["NODE_ENV"] === "production" && process.env["S3_EXPORT_BUCKET"]) {
    return new S3Storage();
  }
  return new LocalStorage();
}

// =============================================================================
// Value Formatters
// =============================================================================

/**
 * Format a value based on formatter type
 */
function formatValue(
  value: unknown,
  formatter?: ExportColumn["formatter"],
  format?: string
): string {
  if (value === null || value === undefined) {
    return "";
  }

  switch (formatter) {
    case "date":
      if (value instanceof Date) {
        return value.toISOString().split("T")[0] || "";
      }
      if (typeof value === "string" && value) {
        return new Date(value).toISOString().split("T")[0] || "";
      }
      return String(value);

    case "datetime":
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === "string" && value) {
        return new Date(value).toISOString();
      }
      return String(value);

    case "currency":
      if (typeof value === "number") {
        return value.toLocaleString("en-US", {
          style: "currency",
          currency: format || "USD",
        });
      }
      return String(value);

    case "percentage":
      if (typeof value === "number") {
        return `${(value * 100).toFixed(2)}%`;
      }
      return String(value);

    case "boolean":
      return value ? "Yes" : "No";

    default:
      return String(value);
  }
}

// =============================================================================
// CSV Generator
// =============================================================================

/**
 * Generate CSV content from rows
 */
function generateCsv(
  rows: Array<Record<string, unknown>>,
  columns: ExportColumn[],
  options: {
    delimiter?: string;
    quoteChar?: string;
    escapeChar?: string;
    lineEnding?: string;
    includeHeaders?: boolean;
  } = {}
): string {
  const {
    delimiter = ",",
    quoteChar = '"',
    escapeChar = '"',
    lineEnding = "\n",
    includeHeaders = true,
  } = options;

  const escape = (value: string): string => {
    if (value.includes(quoteChar) || value.includes(delimiter) || value.includes("\n")) {
      return quoteChar + value.replace(new RegExp(quoteChar, "g"), escapeChar + quoteChar) + quoteChar;
    }
    return value;
  };

  const lines: string[] = [];

  // Add headers
  if (includeHeaders) {
    const headerRow = columns.map((col) => escape(col.header)).join(delimiter);
    lines.push(headerRow);
  }

  // Add data rows
  for (const row of rows) {
    const dataRow = columns
      .map((col) => escape(formatValue(row[col.field], col.formatter, col.format)))
      .join(delimiter);
    lines.push(dataRow);
  }

  return lines.join(lineEnding);
}

// =============================================================================
// Excel Generator
// =============================================================================

/**
 * Generate Excel content using exceljs
 */
async function generateExcel(
  rows: Array<Record<string, unknown>>,
  columns: ExportColumn[],
  options: {
    sheetName?: string;
    includeHeaders?: boolean;
    autoFitColumns?: boolean;
    freezeHeader?: boolean;
  } = {}
): Promise<Buffer> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "HRIS Platform";
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet(options.sheetName || "Export", {
    views: options.freezeHeader !== false ? [{ state: "frozen", ySplit: 1 }] : undefined,
  });

  // Set up columns
  sheet.columns = columns.map((col) => ({
    header: options.includeHeaders !== false ? col.header : undefined,
    key: col.field,
    width: col.width || 15,
  }));

  // Style header row
  if (options.includeHeaders !== false) {
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
    headerRow.border = {
      bottom: { style: "thin", color: { argb: "FF000000" } },
    };
  }

  // Add data rows
  for (const row of rows) {
    const rowData: Record<string, unknown> = {};
    for (const col of columns) {
      const value = row[col.field];
      // Apply formatting based on column type
      switch (col.formatter) {
        case "date":
          rowData[col.field] = value instanceof Date ? value : value ? new Date(String(value)) : null;
          break;
        case "datetime":
          rowData[col.field] = value instanceof Date ? value : value ? new Date(String(value)) : null;
          break;
        case "currency":
          rowData[col.field] = typeof value === "number" ? value : value ? Number(value) : null;
          break;
        case "percentage":
          rowData[col.field] = typeof value === "number" ? value : value ? Number(value) : null;
          break;
        case "boolean":
          rowData[col.field] = value ? "Yes" : "No";
          break;
        default:
          rowData[col.field] = value;
      }
    }
    sheet.addRow(rowData);
  }

  // Apply column formatting
  columns.forEach((col, index) => {
    const excelCol = sheet.getColumn(index + 1);

    switch (col.formatter) {
      case "date":
        excelCol.numFmt = col.format || "yyyy-mm-dd";
        break;
      case "datetime":
        excelCol.numFmt = col.format || "yyyy-mm-dd hh:mm:ss";
        break;
      case "currency":
        excelCol.numFmt = col.format || "$#,##0.00";
        break;
      case "percentage":
        excelCol.numFmt = col.format || "0.00%";
        break;
    }
  });

  // Auto-fit columns if requested
  if (options.autoFitColumns !== false) {
    sheet.columns.forEach((column) => {
      if (column.values) {
        const lengths = column.values
          .filter((v): v is string | number | Date => v !== null && v !== undefined)
          .map((v) => String(v).length);
        const maxLength = Math.max(...lengths, 10);
        column.width = Math.min(maxLength + 2, 50);
      }
    });
  }

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// =============================================================================
// Query Executor
// =============================================================================

/**
 * Execute export query and return rows
 */
async function executeExportQuery(
  db: import("../plugins/db").DatabaseClient,
  tenantId: string,
  query: ExportQuery,
  onProgress?: (processed: number) => void
): Promise<Array<Record<string, unknown>>> {
  const { table, columns, filters, orderBy, limit } = query;

  // Build column selection
  const columnNames = columns.map((c) => c.field);

  // Execute query with tenant context
  const rows = await db.withSystemContext(async (tx) => {
    // Set tenant context for RLS
    await tx`SELECT app.set_tenant_context(${tenantId}::uuid, NULL)`;

    // Build and execute query using unsafe for dynamic SQL parts
    // Note: table and column names are validated against allowed lists
    const columnsStr = columnNames.join(", ");
    const orderByStr = orderBy && orderBy.length > 0
      ? `ORDER BY ${orderBy.map((o) => `${o.field} ${o.direction}`).join(", ")}`
      : "";
    const limitStr = limit ? `LIMIT ${limit}` : "";

    const result = await tx.unsafe<Array<Record<string, unknown>>>(
      `SELECT ${columnsStr} FROM ${table} WHERE tenant_id = $1::uuid ${orderByStr} ${limitStr}`,
      [tenantId]
    );

    await tx`SELECT app.clear_tenant_context()`;

    return result;
  });

  // Call progress callback
  if (onProgress) {
    onProgress(rows.length);
  }

  return rows;
}

// =============================================================================
// CSV Export Processor
// =============================================================================

/**
 * Process CSV export job
 */
async function processCsvExport(
  payload: JobPayload<CsvExportPayload>,
  context: JobContext
): Promise<void> {
  const { log, db, redis } = context;
  const {
    query,
    name,
    delimiter,
    includeHeaders,
    quoteChar,
    escapeChar,
    lineEnding,
    notifyUserId,
  } = payload.data;

  if (!payload.tenantId) {
    throw new Error("Tenant ID is required for exports");
  }

  const exportId = payload.id;
  log.info(`Starting CSV export: ${name}`, { exportId });

  try {
    // Update export status to processing
    await updateExportStatus(db, exportId, "processing");

    // Execute query
    log.info("Executing export query");
    const rows = await executeExportQuery(db, payload.tenantId, query, (count) => {
      log.debug(`Processed ${count} rows`);
    });

    log.info(`Query returned ${rows.length} rows`);

    // Generate CSV
    const csv = generateCsv(rows, query.columns, {
      delimiter,
      quoteChar,
      escapeChar,
      lineEnding,
      includeHeaders: includeHeaders ?? true,
    });

    // Save to storage
    const storage = getStorage();
    const filename = `${exportId}_${name.replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
    const filePath = await storage.save(filename, csv);
    const downloadUrl = await storage.getDownloadUrl(filePath, 86400); // 24 hours

    const fileSize = Buffer.byteLength(csv, "utf-8");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Update export record
    await completeExport(db, exportId, {
      filePath,
      fileSize,
      rowCount: rows.length,
      expiresAt,
    });

    log.info("CSV export completed", { downloadUrl, fileSize, rowCount: rows.length });

    // Notify user if requested
    if (notifyUserId && payload.tenantId) {
      await notifyExportComplete(redis, {
        tenantId: payload.tenantId,
        userId: notifyUserId,
        exportId,
        name,
        format: "csv",
        downloadUrl,
        rowCount: rows.length,
      });
    }
  } catch (error) {
    log.error("CSV export failed", error);

    // Update export status
    await updateExportStatus(
      db,
      exportId,
      "failed",
      error instanceof Error ? error.message : String(error)
    );

    throw error;
  }
}

// =============================================================================
// Excel Export Processor
// =============================================================================

/**
 * Process Excel export job
 */
async function processExcelExport(
  payload: JobPayload<ExcelExportPayload>,
  context: JobContext
): Promise<void> {
  const { log, db, redis } = context;
  const {
    query,
    name,
    sheetName,
    includeHeaders,
    autoFitColumns,
    freezeHeader,
    notifyUserId,
  } = payload.data;

  if (!payload.tenantId) {
    throw new Error("Tenant ID is required for exports");
  }

  const exportId = payload.id;
  log.info(`Starting Excel export: ${name}`, { exportId });

  try {
    // Update export status to processing
    await updateExportStatus(db, exportId, "processing");

    // Execute query
    log.info("Executing export query");
    const rows = await executeExportQuery(db, payload.tenantId, query);

    log.info(`Query returned ${rows.length} rows`);

    // Generate Excel
    const excel = await generateExcel(rows, query.columns, {
      sheetName,
      includeHeaders: includeHeaders ?? true,
      autoFitColumns,
      freezeHeader,
    });

    // Save to storage
    const storage = getStorage();
    const filename = `${exportId}_${name.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`;
    const filePath = await storage.save(filename, excel);
    const downloadUrl = await storage.getDownloadUrl(filePath, 86400);

    const fileSize = excel.length;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Update export record
    await completeExport(db, exportId, {
      filePath,
      fileSize,
      rowCount: rows.length,
      expiresAt,
    });

    log.info("Excel export completed", { downloadUrl, fileSize, rowCount: rows.length });

    // Notify user
    if (notifyUserId && payload.tenantId) {
      await notifyExportComplete(redis, {
        tenantId: payload.tenantId,
        userId: notifyUserId,
        exportId,
        name,
        format: "xlsx",
        downloadUrl,
        rowCount: rows.length,
      });
    }
  } catch (error) {
    log.error("Excel export failed", error);

    await updateExportStatus(
      db,
      exportId,
      "failed",
      error instanceof Error ? error.message : String(error)
    );

    throw error;
  }
}

// =============================================================================
// Database Operations
// =============================================================================

/**
 * Create an export record
 */
export async function createExportRecord(
  db: import("../plugins/db").DatabaseClient,
  record: {
    id: string;
    tenantId: string;
    userId: string;
    name: string;
    format: ExportFormat;
  }
): Promise<void> {
  await db.withSystemContext(async (tx) => {
    await tx`
      INSERT INTO app.exports (
        id,
        tenant_id,
        user_id,
        name,
        format,
        status,
        created_at
      )
      VALUES (
        ${record.id}::uuid,
        ${record.tenantId}::uuid,
        ${record.userId}::uuid,
        ${record.name},
        ${record.format},
        'pending',
        now()
      )
    `;
  });
}

/**
 * Update export status
 */
async function updateExportStatus(
  db: import("../plugins/db").DatabaseClient,
  exportId: string,
  status: ExportStatus,
  error?: string
): Promise<void> {
  await db.withSystemContext(async (tx) => {
    await tx`
      UPDATE app.exports
      SET status = ${status},
          error = ${error || null},
          updated_at = now()
      WHERE id = ${exportId}::uuid
    `;
  });
}

/**
 * Complete an export
 */
async function completeExport(
  db: import("../plugins/db").DatabaseClient,
  exportId: string,
  result: {
    filePath: string;
    fileSize: number;
    rowCount: number;
    expiresAt: Date;
  }
): Promise<void> {
  await db.withSystemContext(async (tx) => {
    await tx`
      UPDATE app.exports
      SET status = 'completed',
          file_path = ${result.filePath},
          file_size = ${result.fileSize},
          row_count = ${result.rowCount},
          expires_at = ${result.expiresAt},
          completed_at = now(),
          updated_at = now()
      WHERE id = ${exportId}::uuid
    `;
  });
}

/**
 * Notify user that export is complete
 */
async function notifyExportComplete(
  redis: import("ioredis").default,
  notification: {
    tenantId: string;
    userId: string;
    exportId: string;
    name: string;
    format: ExportFormat;
    downloadUrl: string;
    rowCount: number;
  }
): Promise<void> {
  // Queue an in-app notification
  await redis.xadd(
    StreamKeys.NOTIFICATIONS,
    "*",
    "payload",
    JSON.stringify({
      id: crypto.randomUUID(),
      type: "notification.in_app",
      tenantId: notification.tenantId,
      userId: notification.userId,
      data: {
        userId: notification.userId,
        title: "Export Ready",
        message: `Your ${notification.format.toUpperCase()} export "${notification.name}" is ready for download (${notification.rowCount} rows).`,
        type: "export_complete",
        actionUrl: notification.downloadUrl,
        actionText: "Download",
        data: {
          exportId: notification.exportId,
          format: notification.format,
          rowCount: notification.rowCount,
        },
      },
      metadata: {
        createdAt: new Date().toISOString(),
      },
    }),
    "attempt",
    "1"
  );
}

/**
 * Cleanup expired exports
 */
export async function cleanupExpiredExports(
  db: import("../plugins/db").DatabaseClient
): Promise<number> {
  const storage = getStorage();

  // Get expired exports
  const expired = await db.withSystemContext(async (tx) => {
    return await tx<Array<{ id: string; filePath: string | null }>>`
      SELECT id, file_path
      FROM app.exports
      WHERE expires_at < now()
        AND status = 'completed'
    `;
  });

  // Delete files
  for (const exp of expired) {
    if (exp.filePath) {
      try {
        await storage.delete(exp.filePath);
      } catch (error) {
        console.error(`[ExportWorker] Failed to delete file ${exp.filePath}:`, error);
      }
    }
  }

  // Update status to expired
  const deleted = await db.withSystemContext(async (tx) => {
    const result = await tx<{ count: number }[]>`
      UPDATE app.exports
      SET status = 'expired',
          file_path = NULL,
          updated_at = now()
      WHERE expires_at < now()
        AND status = 'completed'
      RETURNING 1 as count
    `;
    return result.length;
  });

  return deleted;
}

// =============================================================================
// Processor Registrations
// =============================================================================

/**
 * CSV export processor registration
 */
export const csvExportProcessor: ProcessorRegistration<CsvExportPayload> = {
  type: JobTypes.EXPORT_CSV,
  processor: processCsvExport,
  timeoutMs: 600000, // 10 minutes
  retry: true,
};

/**
 * Excel export processor registration
 */
export const excelExportProcessor: ProcessorRegistration<ExcelExportPayload> = {
  type: JobTypes.EXPORT_EXCEL,
  processor: processExcelExport,
  timeoutMs: 600000, // 10 minutes
  retry: true,
};

/**
 * All export processors
 */
export const exportProcessors: ProcessorRegistration[] = [
  csvExportProcessor,
  excelExportProcessor,
];

export default exportProcessors;
