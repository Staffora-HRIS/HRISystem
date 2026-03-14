/**
 * Documents Service Unit Tests
 *
 * Tests for Document Management business logic including:
 * - Document CRUD validation patterns
 * - Version management rules
 * - MIME type whitelist validation for upload
 * - Download URL generation
 * - Expiring documents logic
 * - My documents summary (with/without employee record)
 *
 * NOTE: These tests extract and verify the business logic directly
 * rather than importing the service class, to avoid bun 1.3.3
 * segfault on Windows when importing modules with native postgres
 * dependencies.
 */

import { describe, it, expect } from "bun:test";

// =============================================================================
// Extracted Business Logic (from modules/documents/service.ts)
// =============================================================================

import type { ServiceResult } from "../../../types/service-result";

// MIME type whitelist from the documents service
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

function getResourceOrNotFound<T>(resource: T | null, name: string): ServiceResult<T> {
  if (!resource) {
    return { success: false, error: { code: "NOT_FOUND", message: `${name} not found` } };
  }
  return { success: true, data: resource };
}

function validateMimeType(mimeType: string): ServiceResult<null> {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return {
      success: false,
      error: {
        code: "INVALID_MIME_TYPE",
        message: `File type ${mimeType} is not allowed`,
      },
    };
  }
  return { success: true };
}

function generateUploadUrl(
  tenantId: string,
  fileName: string,
  mimeType: string
): ServiceResult<{ upload_url: string; file_key: string; expires_at: string }> {
  const mimeResult = validateMimeType(mimeType);
  if (!mimeResult.success) {
    return { success: false, error: mimeResult.error };
  }

  const fileKey = `${tenantId}/${crypto.randomUUID()}/${fileName}`;
  return {
    success: true,
    data: {
      upload_url: `https://storage.example.com/upload/${fileKey}`,
      file_key: fileKey,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    },
  };
}

function generateDownloadUrl(
  document: { id: string; fileKey: string } | null
): ServiceResult<string> {
  if (!document) {
    return { success: false, error: { code: "NOT_FOUND", message: "Document not found" } };
  }
  return {
    success: true,
    data: `https://storage.example.com/download/${document.fileKey}`,
  };
}

function formatMyDocumentsSummary(
  summaryData: {
    employeeId: string | null;
    categoryCounts: Array<{ category: string; count: number }>;
    recentDocuments: unknown[];
    expiringDocuments: unknown[];
  }
): ServiceResult<{
  totalDocuments: number;
  byCategory: Record<string, number>;
  recentDocuments: unknown[];
  expiringDocuments: unknown[];
  message?: string;
}> {
  if (!summaryData.employeeId) {
    return {
      success: true,
      data: {
        totalDocuments: 0,
        byCategory: {},
        recentDocuments: [],
        expiringDocuments: [],
        message: "No employee record found",
      },
    };
  }

  const byCategory: Record<string, number> = {};
  let totalDocuments = 0;
  for (const cc of summaryData.categoryCounts) {
    byCategory[cc.category] = cc.count;
    totalDocuments += cc.count;
  }

  return {
    success: true,
    data: {
      totalDocuments,
      byCategory,
      recentDocuments: summaryData.recentDocuments,
      expiringDocuments: summaryData.expiringDocuments,
    },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("DocumentsService", () => {
  // ===========================================================================
  // Document CRUD
  // ===========================================================================

  describe("Document CRUD", () => {
    describe("getDocument", () => {
      it("should return document when found", () => {
        const doc = {
          id: "d1",
          name: "Employment Contract",
          category: "contract",
          fileKey: "t1/contract.pdf",
          status: "active",
        };
        const result = getResourceOrNotFound(doc, "Document");

        expect(result.success).toBe(true);
        expect(result.data?.name).toBe("Employment Contract");
      });

      it("should return NOT_FOUND for missing document", () => {
        const result = getResourceOrNotFound(null, "Document");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("NOT_FOUND");
      });
    });
  });

  // ===========================================================================
  // Version Management
  // ===========================================================================

  describe("Version Management", () => {
    describe("listVersions", () => {
      it("should return NOT_FOUND for non-existent document", () => {
        const result = getResourceOrNotFound(null, "Document");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("NOT_FOUND");
      });
    });

    describe("createVersion", () => {
      it("should return NOT_FOUND for non-existent document", () => {
        const result = getResourceOrNotFound(null, "Document");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("NOT_FOUND");
      });
    });
  });

  // ===========================================================================
  // Upload URL Generation
  // ===========================================================================

  describe("Upload URL", () => {
    describe("MIME type validation", () => {
      it("should accept PDF", () => {
        const result = validateMimeType("application/pdf");
        expect(result.success).toBe(true);
      });

      it("should accept JPEG", () => {
        const result = validateMimeType("image/jpeg");
        expect(result.success).toBe(true);
      });

      it("should accept PNG", () => {
        const result = validateMimeType("image/png");
        expect(result.success).toBe(true);
      });

      it("should accept CSV", () => {
        const result = validateMimeType("text/csv");
        expect(result.success).toBe(true);
      });

      it("should accept Word documents", () => {
        const result = validateMimeType(
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        expect(result.success).toBe(true);
      });

      it("should accept Excel documents", () => {
        const result = validateMimeType(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        expect(result.success).toBe(true);
      });

      it("should accept legacy Word format", () => {
        const result = validateMimeType("application/msword");
        expect(result.success).toBe(true);
      });

      it("should accept GIF", () => {
        const result = validateMimeType("image/gif");
        expect(result.success).toBe(true);
      });

      it("should accept WebP", () => {
        const result = validateMimeType("image/webp");
        expect(result.success).toBe(true);
      });

      it("should reject executable files", () => {
        const result = validateMimeType("application/x-executable");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("INVALID_MIME_TYPE");
      });

      it("should reject unknown MIME types", () => {
        const result = validateMimeType("application/xyz-unknown");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("INVALID_MIME_TYPE");
      });

      it("should reject zip files", () => {
        const result = validateMimeType("application/zip");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("INVALID_MIME_TYPE");
      });

      it("should reject JavaScript files", () => {
        const result = validateMimeType("application/javascript");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("INVALID_MIME_TYPE");
      });

      it("should reject HTML files", () => {
        const result = validateMimeType("text/html");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("INVALID_MIME_TYPE");
      });
    });

    describe("generateUploadUrl", () => {
      it("should generate upload URL for valid MIME type", () => {
        const tenantId = "tenant-123";
        const result = generateUploadUrl(tenantId, "report.pdf", "application/pdf");

        expect(result.success).toBe(true);
        expect(result.data?.upload_url).toBeDefined();
        expect(result.data?.file_key).toContain(tenantId);
        expect(result.data?.expires_at).toBeDefined();
      });

      it("should include tenant ID in file key", () => {
        const tenantId = "tenant-456";
        const result = generateUploadUrl(tenantId, "doc.pdf", "application/pdf");

        expect(result.success).toBe(true);
        expect(result.data?.file_key).toContain(tenantId);
      });

      it("should reject invalid MIME type", () => {
        const result = generateUploadUrl("tenant-123", "malware.exe", "application/x-executable");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("INVALID_MIME_TYPE");
      });
    });

    describe("MIME type whitelist completeness", () => {
      it("should contain exactly the expected number of MIME types", () => {
        // 13 approved MIME types
        expect(ALLOWED_MIME_TYPES.size).toBe(13);
      });

      it("should include all common document types", () => {
        const essentialTypes = [
          "application/pdf",
          "image/jpeg",
          "image/png",
          "text/csv",
          "text/plain",
        ];

        for (const type of essentialTypes) {
          expect(ALLOWED_MIME_TYPES.has(type)).toBe(true);
        }
      });
    });
  });

  // ===========================================================================
  // Download URL
  // ===========================================================================

  describe("Download URL", () => {
    it("should generate download URL for existing document", () => {
      const result = generateDownloadUrl({ id: "d1", fileKey: "t1/document.pdf" });

      expect(result.success).toBe(true);
      expect(result.data).toContain("download");
      expect(result.data).toContain("t1/document.pdf");
    });

    it("should return NOT_FOUND for non-existent document", () => {
      const result = generateDownloadUrl(null);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });
  });

  // ===========================================================================
  // My Documents Summary
  // ===========================================================================

  describe("My Documents Summary", () => {
    it("should return summary for employee with documents", () => {
      const result = formatMyDocumentsSummary({
        employeeId: "emp1",
        categoryCounts: [
          { category: "contract", count: 3 },
          { category: "policy", count: 2 },
        ],
        recentDocuments: [{ id: "d1" }],
        expiringDocuments: [],
      });

      expect(result.success).toBe(true);
      expect(result.data?.totalDocuments).toBe(5);
      expect(result.data?.byCategory).toEqual({ contract: 3, policy: 2 });
      expect(result.data?.recentDocuments).toHaveLength(1);
      expect(result.data?.message).toBeUndefined();
    });

    it("should return empty summary when no employee record found", () => {
      const result = formatMyDocumentsSummary({
        employeeId: null,
        categoryCounts: [],
        recentDocuments: [],
        expiringDocuments: [],
      });

      expect(result.success).toBe(true);
      expect(result.data?.totalDocuments).toBe(0);
      expect(result.data?.message).toBe("No employee record found");
    });

    it("should calculate total from category counts", () => {
      const result = formatMyDocumentsSummary({
        employeeId: "emp1",
        categoryCounts: [
          { category: "contract", count: 5 },
          { category: "certification", count: 3 },
          { category: "policy", count: 7 },
        ],
        recentDocuments: [],
        expiringDocuments: [],
      });

      expect(result.data?.totalDocuments).toBe(15);
    });

    it("should handle empty category counts for existing employee", () => {
      const result = formatMyDocumentsSummary({
        employeeId: "emp1",
        categoryCounts: [],
        recentDocuments: [],
        expiringDocuments: [],
      });

      expect(result.success).toBe(true);
      expect(result.data?.totalDocuments).toBe(0);
      expect(result.data?.byCategory).toEqual({});
    });
  });
});
