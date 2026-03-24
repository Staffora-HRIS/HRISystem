/**
 * Export Worker
 *
 * Generates report exports in various formats:
 * - CSV export generation
 * - Excel (XLSX) export generation
 * - Large dataset handling with cursor-based streaming
 * - Upload to storage and create download links
 * - Notify users when export is complete
 *
 * Features:
 * - Cursor-based streaming for large datasets (>=1000 rows) to avoid loading
 *   entire result sets into memory. Uses postgres.js cursor() with batched
 *   reads and writes rows incrementally to temp files.
 * - In-memory generation for small datasets (<1000 rows) for simplicity
 * - Progress tracking via log callbacks
 * - Automatic cleanup of old exports and temp files
 * - Support for custom queries with table allowlist validation
 */

import {
  type JobPayload,
  type JobContext,
  type ProcessorRegistration,
  JobTypes,
  StreamKeys,
} from "./base";

// =============================================================================
// Constants
// =============================================================================

/**
 * Row count threshold for switching from in-memory to streaming export.
 * Datasets with fewer rows than this use in-memory generation; larger
 * datasets use cursor-based streaming to avoid high memory usage.
 */
const STREAMING_THRESHOLD = 1000;

/**
 * Number of rows to fetch per cursor batch when streaming.
 * Balances memory usage against round-trip overhead.
 */
const CURSOR_BATCH_SIZE = 500;

/**
 * Absolute maximum number of rows an export can return.
 * Prevents unbounded queries from exhausting database or memory resources.
 */
const MAX_EXPORT_ROWS = 100_000;

/**
 * Default row limit when the caller does not specify one.
 */
const DEFAULT_EXPORT_ROWS = 10_000;

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
 *
 * SECURITY NOTE: This interface intentionally does NOT include a `customSql`
 * or arbitrary `filters` field. All SQL is constructed server-side from
 * validated, allowlisted table names and identifier-checked column names.
 * Job payloads must never carry raw SQL strings.
 */
export interface ExportQuery {
  /** Base table or view (must be in ALLOWED_EXPORT_TABLES allowlist) */
  table: string;
  /** Columns to export (each field name is validated against SAFE_IDENTIFIER_RE) */
  columns: ExportColumn[];
  /** ORDER BY clause (each field is validated against SAFE_IDENTIFIER_RE) */
  orderBy?: Array<{ field: string; direction: "asc" | "desc" }>;
  /** Maximum rows to export (capped at MAX_EXPORT_ROWS) */
  limit?: number;
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
  /** Save content (Buffer or string) and return the storage path */
  save(filename: string, content: Buffer | string): Promise<string>;
  /** Save from a local file path (for streaming exports that write to temp files) */
  saveFromFile(filename: string, localPath: string): Promise<string>;
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
    this.basePath = process.env["EXPORT_STORAGE_PATH"] || "/tmp/staffora-exports";
    this.baseUrl = process.env["EXPORT_BASE_URL"] || "http://localhost:3000/api/exports";
  }

  /**
   * Sanitise a filename to prevent path traversal attacks.
   * Strips directory components via path.basename() and restricts
   * the remaining characters to a safe allowlist.
   */
  private sanitiseFilename(pathMod: typeof import("path"), filename: string): string {
    // Strip any directory components (e.g. "../../etc/passwd" -> "passwd")
    let safe = pathMod.basename(filename);
    // Restrict to alphanumeric, hyphens, underscores, and dots
    safe = safe.replace(/[^a-zA-Z0-9._-]/g, "_");
    // Prevent empty or dot-only filenames
    if (!safe || safe === "." || safe === "..") {
      safe = "export";
    }
    return safe;
  }

  async save(filename: string, content: Buffer | string): Promise<string> {
    const fs = await import("fs/promises");
    const path = await import("path");

    const safeFilename = this.sanitiseFilename(path, filename);

    // Ensure directory exists
    await fs.mkdir(this.basePath, { recursive: true });

    const filePath = path.join(this.basePath, safeFilename);
    await fs.writeFile(filePath, content);

    return filePath;
  }

  async saveFromFile(filename: string, localPath: string): Promise<string> {
    const fs = await import("fs/promises");
    const path = await import("path");

    const safeFilename = this.sanitiseFilename(path, filename);

    // Ensure directory exists
    await fs.mkdir(this.basePath, { recursive: true });

    const destPath = path.join(this.basePath, safeFilename);
    // If source and destination differ, copy the file
    if (path.resolve(localPath) !== path.resolve(destPath)) {
      await fs.copyFile(localPath, destPath);
    }
    return destPath;
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
    this.bucket = process.env["S3_EXPORT_BUCKET"] || "staffora-exports";
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

  private getContentType(filename: string): string {
    if (filename.endsWith(".csv")) return "text/csv";
    if (filename.endsWith(".xlsx")) {
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
    return "application/octet-stream";
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
        ContentType: this.getContentType(filename),
      })
    );

    return `s3://${this.bucket}/${key}`;
  }

  async saveFromFile(filename: string, localPath: string): Promise<string> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const fs = await import("fs");
    const client = await this.getClient();
    const key = `${this.prefix}${filename}`;

    // Read the file as a stream for the S3 upload to avoid loading into memory
    const fileStream = fs.createReadStream(localPath);

    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fileStream as unknown as import("@aws-sdk/client-s3").PutObjectCommandInput["Body"],
        ContentType: this.getContentType(filename),
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
        return value.toLocaleString("en-GB", {
          style: "currency",
          currency: format || "GBP",
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
// CSV Generator (in-memory, for small datasets)
// =============================================================================

/**
 * CSV escaping helper. Shared between in-memory and streaming generators.
 */
function createCsvEscaper(
  delimiter: string,
  quoteChar: string,
  escapeChar: string
): (value: string) => string {
  const quoteRegex = new RegExp(quoteChar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  return (value: string): string => {
    if (value.includes(quoteChar) || value.includes(delimiter) || value.includes("\n")) {
      return quoteChar + value.replace(quoteRegex, escapeChar + quoteChar) + quoteChar;
    }
    return value;
  };
}

/**
 * Format a single row as a CSV line (no trailing line ending).
 */
function formatCsvRow(
  row: Record<string, unknown>,
  columns: ExportColumn[],
  delimiter: string,
  escape: (value: string) => string
): string {
  return columns
    .map((col) => escape(formatValue(row[col.field], col.formatter, col.format)))
    .join(delimiter);
}

/**
 * Generate CSV content from rows (in-memory, for small datasets)
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

  const escape = createCsvEscaper(delimiter, quoteChar, escapeChar);

  const lines: string[] = [];

  // Add headers
  if (includeHeaders) {
    const headerRow = columns.map((col) => escape(col.header)).join(delimiter);
    lines.push(headerRow);
  }

  // Add data rows
  for (const row of rows) {
    lines.push(formatCsvRow(row, columns, delimiter, escape));
  }

  return lines.join(lineEnding);
}

// =============================================================================
// Excel Generator (in-memory, for small datasets)
// =============================================================================

/**
 * Convert a row's column value to the appropriate Excel cell value
 */
function formatExcelCellValue(value: unknown, formatter?: ExportColumn["formatter"]): unknown {
  switch (formatter) {
    case "date":
    case "datetime":
      return value instanceof Date ? value : value ? new Date(String(value)) : null;
    case "currency":
    case "percentage":
      return typeof value === "number" ? value : value ? Number(value) : null;
    case "boolean":
      return value ? "Yes" : "No";
    default:
      return value;
  }
}

/**
 * Generate Excel content using exceljs (in-memory, for small datasets)
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

  workbook.creator = "Staffora";
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
      rowData[col.field] = formatExcelCellValue(row[col.field], col.formatter);
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
// Query Helpers
// =============================================================================

/**
 * Allowlist of tables that can be exported.
 * Only tables in this set can be queried by the export worker.
 * This prevents SQL injection via job payloads that specify arbitrary table names.
 */
const ALLOWED_EXPORT_TABLES = new Set([
  "employees", "employment_contracts", "position_assignments", "positions",
  "org_units", "departments", "cost_centers", "reporting_lines",
  "compensation_history", "leave_requests", "leave_balances", "leave_types",
  "time_events", "timesheets", "timesheet_lines", "schedules", "shifts",
  "shift_assignments", "cases", "case_comments",
  "courses", "assignments", "completions", "certificates",
  "onboarding_instances", "onboarding_task_completions",
  "benefit_enrollments", "benefit_plans",
  "goals", "reviews", "performance_cycles", "competencies",
  "requisitions", "candidates", "interviews",
  "documents", "audit_log",
  "employee_personal", "employee_contacts", "employee_addresses",
  "employee_warnings", "employee_bank_details", "emergency_contacts",
  "payroll_runs", "payroll_lines", "payslips",
  "succession_plans", "succession_candidates",
  "training_budgets", "training_expenses", "cpd_records",
]);

/**
 * Strict SQL identifier validator.
 * Only allows alphanumeric characters and underscores.
 * Prevents SQL injection via column/table names.
 */
const SAFE_IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function validateIdentifier(name: string, context: string): void {
  if (!SAFE_IDENTIFIER_RE.test(name)) {
    throw new Error(`Invalid ${context}: "${name}" -- must be alphanumeric/underscore only`);
  }
}

/**
 * Validated query components shared between count, in-memory, and streaming paths.
 */
interface ValidatedExportQuery {
  /** Quoted, validated column list for SELECT clause (e.g. '"first_name", "last_name"') */
  columnsStr: string;
  /** Validated ORDER BY clause (may be empty string) */
  orderByStr: string;
  /** Clamped LIMIT value */
  limitVal: number;
  /** The validated table name (unquoted) */
  table: string;
}

/**
 * Validate and build SQL components from an ExportQuery.
 * Centralises validation so all code paths share the same security checks.
 */
function buildValidatedQuery(query: ExportQuery): ValidatedExportQuery {
  const { table, columns, orderBy, limit } = query;

  // Validate table against allowlist
  if (!ALLOWED_EXPORT_TABLES.has(table)) {
    throw new Error(`Export table "${table}" is not in the allowed tables list`);
  }
  validateIdentifier(table, "table name");

  // Validate and quote column names
  const columnNames = columns.map((c) => {
    validateIdentifier(c.field, "column name");
    return `"${c.field}"`;
  });

  const validDirections = new Set(["ASC", "DESC", "asc", "desc"]);

  const orderByStr = orderBy && orderBy.length > 0
    ? `ORDER BY ${orderBy.map((o) => {
        validateIdentifier(o.field, "order-by field");
        const dir = validDirections.has(o.direction) ? o.direction.toUpperCase() : "ASC";
        return `"${o.field}" ${dir}`;
      }).join(", ")}`
    : "";

  const limitVal = limit && Number.isFinite(limit) && limit > 0 ? Math.min(limit, MAX_EXPORT_ROWS) : DEFAULT_EXPORT_ROWS;

  return {
    columnsStr: columnNames.join(", "),
    orderByStr,
    limitVal,
    table,
  };
}

/**
 * Build the full SELECT SQL string from validated components.
 *
 * SECURITY BOUNDARY: This function uses string interpolation to build SQL,
 * which is then executed via tx.unsafe(). This is safe ONLY because every
 * interpolated value has been validated by buildValidatedQuery():
 *
 *   - vq.table: validated against ALLOWED_EXPORT_TABLES allowlist AND
 *     SAFE_IDENTIFIER_RE regex (alphanumeric + underscore only)
 *   - vq.columnsStr: each column validated against SAFE_IDENTIFIER_RE,
 *     then double-quoted as SQL identifiers
 *   - vq.orderByStr: each field validated against SAFE_IDENTIFIER_RE,
 *     direction constrained to "ASC"/"DESC" literal values
 *   - vq.limitVal: a clamped positive integer (typeof number)
 *   - tenant_id: passed as a parameterised $1 bind variable, never interpolated
 *
 * DO NOT add additional interpolated values without equivalent validation.
 * DO NOT bypass buildValidatedQuery() when calling this function.
 */
function buildSelectSql(vq: ValidatedExportQuery): string {
  return `SELECT ${vq.columnsStr} FROM app."${vq.table}" WHERE tenant_id = $1::uuid ${vq.orderByStr} LIMIT ${vq.limitVal}`;
}

// =============================================================================
// Row Count Query
// =============================================================================

/**
 * Get the row count for an export query (capped at limitVal).
 * Used to decide whether to use in-memory or streaming export.
 */
async function getExportRowCount(
  db: import("../plugins/db").DatabaseClient,
  tenantId: string,
  query: ExportQuery
): Promise<number> {
  const vq = buildValidatedQuery(query);

  // System context bypasses RLS; the WHERE tenant_id = $1 clause provides
  // data isolation by filtering to the specific tenant's rows only.
  const rows = await db.withSystemContext(async (tx) => {
    const result = await tx.unsafe<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM (SELECT 1 FROM app."${vq.table}" WHERE tenant_id = $1::uuid ${vq.orderByStr} LIMIT ${vq.limitVal}) sub`,
      [tenantId]
    );

    return result;
  });

  return parseInt(rows[0]?.count ?? "0", 10);
}

// =============================================================================
// In-Memory Query Executor (for small datasets)
// =============================================================================

/**
 * Execute export query and return all rows in memory.
 * Used for small datasets below STREAMING_THRESHOLD.
 */
async function executeExportQuery(
  db: import("../plugins/db").DatabaseClient,
  tenantId: string,
  query: ExportQuery,
  onProgress?: (processed: number) => void
): Promise<Array<Record<string, unknown>>> {
  const vq = buildValidatedQuery(query);
  const sql = buildSelectSql(vq);

  // System context bypasses RLS; the WHERE tenant_id = $1 clause in the
  // generated SQL provides data isolation by filtering to this tenant only.
  const rows = await db.withSystemContext(async (tx) => {
    const result = await tx.unsafe<Array<Record<string, unknown>>>(sql, [tenantId]);

    return result;
  });

  if (onProgress) {
    onProgress(rows.length);
  }

  return rows;
}

// =============================================================================
// Streaming CSV Export (for large datasets)
// =============================================================================

/**
 * Stream CSV rows from the database cursor directly to a temp file.
 * Returns the temp file path and total row count.
 *
 * Uses postgres.js cursor(batchSize) as an async iterable to avoid
 * holding the entire result set in memory. Each batch of rows is
 * formatted and flushed to the file immediately.
 */
async function streamCsvToFile(
  db: import("../plugins/db").DatabaseClient,
  tenantId: string,
  query: ExportQuery,
  tempFilePath: string,
  options: {
    delimiter?: string;
    quoteChar?: string;
    escapeChar?: string;
    lineEnding?: string;
    includeHeaders?: boolean;
  },
  onProgress?: (processed: number) => void
): Promise<{ rowCount: number }> {
  const fs = await import("fs");
  const {
    delimiter = ",",
    quoteChar = '"',
    escapeChar = '"',
    lineEnding = "\n",
    includeHeaders = true,
  } = options;

  const escape = createCsvEscaper(delimiter, quoteChar, escapeChar);
  const vq = buildValidatedQuery(query);
  const sql = buildSelectSql(vq);

  // Open a write stream to the temp file
  const writeStream = fs.createWriteStream(tempFilePath, { encoding: "utf-8" });

  // Wrap the write in a promise so we can await drain events for backpressure
  const write = (chunk: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const ok = writeStream.write(chunk);
      if (ok) {
        resolve();
      } else {
        writeStream.once("drain", resolve);
        writeStream.once("error", reject);
      }
    });
  };

  let rowCount = 0;

  try {
    // Write header row
    if (includeHeaders) {
      const headerRow = query.columns.map((col) => escape(col.header)).join(delimiter);
      await write(headerRow + lineEnding);
    }

    // Stream rows from the database using cursor.
    // System context bypasses RLS; the WHERE tenant_id = $1 clause in the
    // generated SQL provides data isolation by filtering to this tenant only.
    await db.withSystemContext(async (tx) => {
      // postgres.js cursor(batchSize) returns an AsyncIterable of row batches
      const cursor = tx.unsafe<Array<Record<string, unknown>>>(sql, [tenantId])
        .cursor(CURSOR_BATCH_SIZE);

      for await (const batch of cursor) {
        for (const row of batch) {
          const line = formatCsvRow(row, query.columns, delimiter, escape);
          await write(line + lineEnding);
          rowCount++;
        }

        if (onProgress) {
          onProgress(rowCount);
        }
      }
    });
  } finally {
    // Ensure the stream is closed
    await new Promise<void>((resolve, reject) => {
      writeStream.end(() => resolve());
      writeStream.once("error", reject);
    });
  }

  return { rowCount };
}

// =============================================================================
// Streaming Excel Export (for large datasets)
// =============================================================================

/**
 * Stream Excel rows from the database cursor to a temp file using
 * ExcelJS streaming WorkbookWriter.
 *
 * The WorkbookWriter writes rows incrementally to the file, keeping
 * memory usage proportional to the batch size rather than the full dataset.
 * Note: auto-fit columns is not available in streaming mode because it
 * requires knowing all values upfront.
 */
async function streamExcelToFile(
  db: import("../plugins/db").DatabaseClient,
  tenantId: string,
  query: ExportQuery,
  tempFilePath: string,
  options: {
    sheetName?: string;
    includeHeaders?: boolean;
    freezeHeader?: boolean;
  },
  onProgress?: (processed: number) => void
): Promise<{ rowCount: number }> {
  const ExcelJS = await import("exceljs");

  // Use the streaming WorkbookWriter which writes to a file incrementally
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: tempFilePath,
    useStyles: true,
  });

  workbook.creator = "Staffora";
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet(options.sheetName || "Export", {
    views: options.freezeHeader !== false ? [{ state: "frozen" as const, ySplit: 1 }] : undefined,
  });

  // Set up columns
  sheet.columns = query.columns.map((col) => ({
    header: options.includeHeaders !== false ? col.header : undefined,
    key: col.field,
    width: col.width || 15,
  }));

  // Style header row (must be done before committing it)
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
    headerRow.commit();
  }

  // Apply column number formats (set on the column definition before writing rows)
  query.columns.forEach((col, index) => {
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

  const vq = buildValidatedQuery(query);
  const sql = buildSelectSql(vq);
  let rowCount = 0;

  // Stream rows from cursor and add to worksheet.
  // System context bypasses RLS; the WHERE tenant_id = $1 clause in the
  // generated SQL provides data isolation by filtering to this tenant only.
  await db.withSystemContext(async (tx) => {
    const cursor = tx.unsafe<Array<Record<string, unknown>>>(sql, [tenantId])
      .cursor(CURSOR_BATCH_SIZE);

    for await (const batch of cursor) {
      for (const row of batch) {
        const rowData: Record<string, unknown> = {};
        for (const col of query.columns) {
          rowData[col.field] = formatExcelCellValue(row[col.field], col.formatter);
        }
        const excelRow = sheet.addRow(rowData);
        excelRow.commit();
        rowCount++;
      }

      if (onProgress) {
        onProgress(rowCount);
      }
    }
  });

  // Commit the worksheet and workbook to flush everything to disk
  sheet.commit();
  await workbook.commit();

  return { rowCount };
}

// =============================================================================
// Temp File Helpers
// =============================================================================

/**
 * Create a temp file path for streaming exports.
 */
async function createTempFilePath(exportId: string, extension: string): Promise<string> {
  const os = await import("os");
  const path = await import("path");
  const fs = await import("fs/promises");

  const tmpDir = path.join(os.tmpdir(), "staffora-export-tmp");
  await fs.mkdir(tmpDir, { recursive: true });
  return path.join(tmpDir, `${exportId}_${Date.now()}.${extension}`);
}

/**
 * Safely remove a temp file, ignoring errors if it does not exist.
 */
async function removeTempFile(filePath: string): Promise<void> {
  const fs = await import("fs/promises");
  try {
    await fs.unlink(filePath);
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Get the file size of a local file.
 */
async function getFileSize(filePath: string): Promise<number> {
  const fs = await import("fs/promises");
  const stat = await fs.stat(filePath);
  return stat.size;
}

// =============================================================================
// CSV Export Processor
// =============================================================================

/**
 * Process CSV export job.
 *
 * For datasets below STREAMING_THRESHOLD, uses in-memory generation.
 * For larger datasets, streams rows from a postgres cursor to a temp file
 * and then uploads the file to storage.
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

    // Determine dataset size to choose export strategy
    const rowCount = await getExportRowCount(db, payload.tenantId, query);
    log.info(`Export row count: ${rowCount} (streaming threshold: ${STREAMING_THRESHOLD})`);

    const storage = getStorage();
    const storageFilename = `${exportId}_${name.replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
    let filePath: string;
    let fileSize: number;
    let actualRowCount: number;

    if (rowCount < STREAMING_THRESHOLD) {
      // --- Small dataset: in-memory generation ---
      log.info("Using in-memory CSV generation (small dataset)");

      const rows = await executeExportQuery(db, payload.tenantId, query, (count) => {
        log.debug(`Processed ${count} rows`);
      });

      actualRowCount = rows.length;
      log.info(`Query returned ${actualRowCount} rows`);

      const csv = generateCsv(rows, query.columns, {
        delimiter,
        quoteChar,
        escapeChar,
        lineEnding,
        includeHeaders: includeHeaders ?? true,
      });

      filePath = await storage.save(storageFilename, csv);
      fileSize = Buffer.byteLength(csv, "utf-8");
    } else {
      // --- Large dataset: streaming to temp file ---
      log.info("Using streaming CSV generation (large dataset)");

      const tempFile = await createTempFilePath(exportId, "csv");
      try {
        const result = await streamCsvToFile(
          db,
          payload.tenantId,
          query,
          tempFile,
          {
            delimiter,
            quoteChar,
            escapeChar,
            lineEnding,
            includeHeaders: includeHeaders ?? true,
          },
          (processed) => {
            // Log progress every 5000 rows
            if (processed % 5000 === 0) {
              log.info(`Streaming progress: ${processed} rows written`);
            }
          }
        );

        actualRowCount = result.rowCount;
        fileSize = await getFileSize(tempFile);

        // Upload temp file to storage
        filePath = await storage.saveFromFile(storageFilename, tempFile);
      } finally {
        await removeTempFile(tempFile);
      }
    }

    const downloadUrl = await storage.getDownloadUrl(filePath, 86400); // 24 hours
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Update export record
    await completeExport(db, exportId, {
      filePath,
      fileSize,
      rowCount: actualRowCount,
      expiresAt,
    });

    log.info("CSV export completed", { downloadUrl, fileSize, rowCount: actualRowCount });

    // Notify user if requested
    if (notifyUserId && payload.tenantId) {
      await notifyExportComplete(redis, {
        tenantId: payload.tenantId,
        userId: notifyUserId,
        exportId,
        name,
        format: "csv",
        downloadUrl,
        rowCount: actualRowCount,
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
 * Process Excel export job.
 *
 * For datasets below STREAMING_THRESHOLD, uses in-memory generation.
 * For larger datasets, streams rows from a postgres cursor through
 * ExcelJS WorkbookWriter to a temp file and then uploads to storage.
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

    // Determine dataset size to choose export strategy
    const rowCount = await getExportRowCount(db, payload.tenantId, query);
    log.info(`Export row count: ${rowCount} (streaming threshold: ${STREAMING_THRESHOLD})`);

    const storage = getStorage();
    const storageFilename = `${exportId}_${name.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`;
    let filePath: string;
    let fileSize: number;
    let actualRowCount: number;

    if (rowCount < STREAMING_THRESHOLD) {
      // --- Small dataset: in-memory generation ---
      log.info("Using in-memory Excel generation (small dataset)");

      const rows = await executeExportQuery(db, payload.tenantId, query);
      actualRowCount = rows.length;
      log.info(`Query returned ${actualRowCount} rows`);

      const excel = await generateExcel(rows, query.columns, {
        sheetName,
        includeHeaders: includeHeaders ?? true,
        autoFitColumns,
        freezeHeader,
      });

      filePath = await storage.save(storageFilename, excel);
      fileSize = excel.length;
    } else {
      // --- Large dataset: streaming to temp file ---
      // Note: auto-fit columns is not available in streaming mode since it
      // requires knowing all values upfront. Column widths use the explicit
      // width from ExportColumn or a default of 15.
      if (autoFitColumns !== false) {
        log.info(
          "Auto-fit columns disabled for streaming export (requires all data in memory). " +
          "Using explicit column widths."
        );
      }

      log.info("Using streaming Excel generation (large dataset)");

      const tempFile = await createTempFilePath(exportId, "xlsx");
      try {
        const result = await streamExcelToFile(
          db,
          payload.tenantId,
          query,
          tempFile,
          {
            sheetName,
            includeHeaders: includeHeaders ?? true,
            freezeHeader,
          },
          (processed) => {
            if (processed % 5000 === 0) {
              log.info(`Streaming progress: ${processed} rows written`);
            }
          }
        );

        actualRowCount = result.rowCount;
        fileSize = await getFileSize(tempFile);

        // Upload temp file to storage
        filePath = await storage.saveFromFile(storageFilename, tempFile);
      } finally {
        await removeTempFile(tempFile);
      }
    }

    const downloadUrl = await storage.getDownloadUrl(filePath, 86400);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Update export record
    await completeExport(db, exportId, {
      filePath,
      fileSize,
      rowCount: actualRowCount,
      expiresAt,
    });

    log.info("Excel export completed", { downloadUrl, fileSize, rowCount: actualRowCount });

    // Notify user
    if (notifyUserId && payload.tenantId) {
      await notifyExportComplete(redis, {
        tenantId: payload.tenantId,
        userId: notifyUserId,
        exportId,
        name,
        format: "xlsx",
        downloadUrl,
        rowCount: actualRowCount,
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
