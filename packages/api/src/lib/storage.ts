/**
 * Unified Storage Service
 *
 * Provides a consistent interface for file storage operations across
 * the entire API (documents, exports, PDF generation).
 *
 * Supports two backends controlled by the STORAGE_TYPE env var:
 *   - "local" (default): Files stored on disk, URLs served by the API
 *   - "s3": Files stored in S3, presigned URLs for direct upload/download
 *
 * S3 configuration uses these env vars (from docker/.env.example):
 *   S3_BUCKET, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY
 */

// =============================================================================
// Storage Interface
// =============================================================================

/**
 * Storage service interface.
 *
 * All storage backends must implement this contract.
 */
export interface StorageService {
  /**
   * Generate a presigned upload URL (or local equivalent).
   * The client uses this URL to PUT the file directly.
   *
   * @param fileKey  - Object key / path within the storage bucket
   * @param mimeType - Content type of the file being uploaded
   * @param expiresIn - URL validity in seconds (default: 900 = 15 min)
   * @returns Presigned upload URL
   */
  getUploadUrl(fileKey: string, mimeType: string, expiresIn?: number): Promise<string>;

  /**
   * Generate a presigned download URL (or local equivalent).
   *
   * @param fileKey   - Object key / path within the storage bucket
   * @param expiresIn - URL validity in seconds (default: 3600 = 1 hour)
   * @returns Presigned download URL
   */
  getDownloadUrl(fileKey: string, expiresIn?: number): Promise<string>;

  /**
   * Save a file directly from the server (used by background workers).
   *
   * @param fileKey - Object key / path within the storage bucket
   * @param content - File contents
   * @param mimeType - Content type (optional, inferred from key if omitted)
   * @returns The canonical storage path (e.g., local path or s3:// URI)
   */
  save(fileKey: string, content: Buffer | string, mimeType?: string): Promise<string>;

  /**
   * Delete a file.
   *
   * @param fileKey - Object key / path within the storage bucket
   */
  delete(fileKey: string): Promise<void>;
}

// =============================================================================
// Local Storage Implementation
// =============================================================================

/**
 * Local filesystem storage for development.
 *
 * Files are stored under STORAGE_PATH (default: /tmp/staffora-storage).
 * Download/upload URLs point to the API server.
 */
export class LocalStorageService implements StorageService {
  private readonly basePath: string;
  private readonly baseUrl: string;

  constructor() {
    this.basePath = process.env["STORAGE_PATH"] || "/tmp/staffora-storage";
    this.baseUrl = process.env["STORAGE_BASE_URL"]
      || `http://localhost:${process.env["API_PORT"] || "3000"}`;
  }

  /**
   * Resolve a file key to a safe absolute path within basePath.
   * Rejects path traversal attempts (e.g., "../../../etc/passwd").
   */
  private async safePath(fileKey: string): Promise<string> {
    const path = await import("path");

    // Reject keys that contain directory traversal sequences or absolute paths
    if (fileKey.includes("..") || path.isAbsolute(fileKey)) {
      throw new Error(`Invalid file key: path traversal is not allowed`);
    }

    const resolved = path.resolve(this.basePath, fileKey);

    // Double-check the resolved path is within basePath
    const normalizedBase = path.resolve(this.basePath);
    if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
      throw new Error(`Invalid file key: path traversal is not allowed`);
    }

    return resolved;
  }

  async getUploadUrl(fileKey: string, _mimeType: string, _expiresIn?: number): Promise<string> {
    // Validate key before generating URL
    await this.safePath(fileKey);
    return `${this.baseUrl}/api/v1/documents/files/${encodeURIComponent(fileKey)}`;
  }

  async getDownloadUrl(fileKey: string, _expiresIn?: number): Promise<string> {
    await this.safePath(fileKey);
    return `${this.baseUrl}/api/v1/documents/files/${encodeURIComponent(fileKey)}`;
  }

  async save(fileKey: string, content: Buffer | string, _mimeType?: string): Promise<string> {
    const fs = await import("fs/promises");
    const path = await import("path");

    const filePath = await this.safePath(fileKey);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    const body = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
    await fs.writeFile(filePath, body);

    return filePath;
  }

  async delete(fileKey: string): Promise<void> {
    const fs = await import("fs/promises");

    const filePath = await this.safePath(fileKey);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
}

// =============================================================================
// S3 Storage Implementation
// =============================================================================

/**
 * S3-compatible storage for staging/production.
 *
 * Uses presigned URLs so clients upload/download directly from S3,
 * bypassing the API server for large files.
 */
export class S3StorageService implements StorageService {
  private readonly bucket: string;
  private readonly region: string;
  private s3Client: import("@aws-sdk/client-s3").S3Client | null = null;

  constructor() {
    this.bucket = process.env["S3_BUCKET"] || "staffora-storage";
    this.region = process.env["S3_REGION"] || "eu-west-2";
  }

  private async getClient(): Promise<import("@aws-sdk/client-s3").S3Client> {
    if (!this.s3Client) {
      const { S3Client } = await import("@aws-sdk/client-s3");

      const accessKeyId = process.env["S3_ACCESS_KEY"];
      const secretAccessKey = process.env["S3_SECRET_KEY"];

      this.s3Client = new S3Client({
        region: this.region,
        credentials:
          accessKeyId && secretAccessKey
            ? { accessKeyId, secretAccessKey }
            : undefined, // Fall back to default credential provider chain
      });
    }
    return this.s3Client;
  }

  async getUploadUrl(fileKey: string, mimeType: string, expiresIn: number = 900): Promise<string> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");

    const client = await this.getClient();
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
      ContentType: mimeType,
    });

    return getSignedUrl(client, command, { expiresIn });
  }

  async getDownloadUrl(fileKey: string, expiresIn: number = 3600): Promise<string> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");

    const client = await this.getClient();
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
    });

    return getSignedUrl(client, command, { expiresIn });
  }

  async save(fileKey: string, content: Buffer | string, mimeType?: string): Promise<string> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");

    const client = await this.getClient();
    const body = typeof content === "string" ? Buffer.from(content, "utf-8") : content;

    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
        Body: body,
        ContentType: mimeType || inferMimeType(fileKey),
      })
    );

    return `s3://${this.bucket}/${fileKey}`;
  }

  async delete(fileKey: string): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");

    const client = await this.getClient();
    await client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
      })
    );
  }
}

// =============================================================================
// Factory
// =============================================================================

let _instance: StorageService | null = null;

/**
 * Get the storage service singleton.
 *
 * Uses STORAGE_TYPE env var to determine the backend:
 *   - "s3"    -> S3StorageService
 *   - "local" -> LocalStorageService (default)
 */
export function getStorageService(): StorageService {
  if (!_instance) {
    const storageType = (process.env["STORAGE_TYPE"] || "local").toLowerCase();

    if (storageType === "s3") {
      _instance = new S3StorageService();
    } else {
      _instance = new LocalStorageService();
    }
  }
  return _instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetStorageService(): void {
  _instance = null;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Infer MIME type from file extension.
 */
function inferMimeType(fileKey: string): string {
  const ext = fileKey.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "csv":
      return "text/csv";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "json":
      return "application/json";
    case "txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}
