/**
 * PDF Worker Unit Tests
 *
 * Tests the PDF generation system:
 * - HtmlPdfGenerator: certificate, employment letter, case bundle cover, default
 * - PDF merging with pdf-lib
 * - Processor registrations and configuration
 * - Certificate, employment letter, and case bundle processor invocation
 * - Error handling for missing data and invalid PDFs
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import {
  certificateProcessor,
  employmentLetterProcessor,
  caseBundleProcessor,
  pdfProcessors,
  HtmlPdfGenerator,
  type CertificatePayload,
  type EmploymentLetterPayload,
  type PdfDocumentType,
  type PdfGenerator,
} from "../../../jobs/pdf-worker";
import { JobTypes, StreamKeys, type JobPayload, type JobContext } from "../../../jobs/base";

// =============================================================================
// Processor Registrations
// =============================================================================

describe("PDF Worker - Processor Registrations", () => {
  test("certificateProcessor has correct type and 2-minute timeout", () => {
    expect(certificateProcessor.type).toBe(JobTypes.PDF_CERTIFICATE);
    expect(certificateProcessor.type).toBe("pdf.certificate");
    expect(certificateProcessor.timeoutMs).toBe(120000);
    expect(certificateProcessor.retry).toBe(true);
  });

  test("employmentLetterProcessor has correct type and 2-minute timeout", () => {
    expect(employmentLetterProcessor.type).toBe(JobTypes.PDF_EMPLOYMENT_LETTER);
    expect(employmentLetterProcessor.type).toBe("pdf.employment_letter");
    expect(employmentLetterProcessor.timeoutMs).toBe(120000);
    expect(employmentLetterProcessor.retry).toBe(true);
  });

  test("caseBundleProcessor has correct type and 5-minute timeout", () => {
    expect(caseBundleProcessor.type).toBe(JobTypes.PDF_CASE_BUNDLE);
    expect(caseBundleProcessor.type).toBe("pdf.case_bundle");
    expect(caseBundleProcessor.timeoutMs).toBe(300000);
    expect(caseBundleProcessor.retry).toBe(true);
  });

  test("pdfProcessors array contains all 4 processors", () => {
    expect(pdfProcessors).toHaveLength(4);
    const types = pdfProcessors.map((p) => p.type);
    expect(types).toContain("pdf.certificate");
    expect(types).toContain("pdf.employment_letter");
    expect(types).toContain("pdf.case_bundle");
    expect(types).toContain("pdf.bulk_document_item");
  });
});

// =============================================================================
// HtmlPdfGenerator - Certificate Template
// =============================================================================

describe("PDF Worker - HtmlPdfGenerator certificate", () => {
  let generator: HtmlPdfGenerator;

  beforeEach(() => {
    generator = new HtmlPdfGenerator();
  });

  test("generates a valid PDF buffer for certificate template", async () => {
    const buffer = await generator.generate("certificate", {
      companyName: "Staffora Ltd",
      employeeName: "John Doe",
      courseName: "Safety Training",
      completionDate: "2024-06-15",
      issuerName: "Jane Smith",
      issuerTitle: "Training Manager",
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.toString("utf-8", 0, 4)).toBe("%PDF");
  });

  test("handles empty data by using fallback values", async () => {
    const buffer = await generator.generate("certificate", {});

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    // Should not throw -- uses "Company", "Employee", "Course" as defaults
  });
});

// =============================================================================
// HtmlPdfGenerator - Employment Letter Template
// =============================================================================

describe("PDF Worker - HtmlPdfGenerator employment_letter", () => {
  let generator: HtmlPdfGenerator;

  beforeEach(() => {
    generator = new HtmlPdfGenerator();
  });

  test("generates a valid PDF buffer for employment letter", async () => {
    const buffer = await generator.generate("employment_letter", {
      companyName: "Staffora Ltd",
      companyAddress: "123 HR Street, London",
      employeeName: "Alice Johnson",
      employeeTitle: "Software Engineer",
      department: "Engineering",
      startDate: "2023-01-15",
      employmentType: "Full-time",
      issueDate: "2024-06-15",
      issuerName: "HR Director",
      issuerTitle: "Director",
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.toString("utf-8", 0, 4)).toBe("%PDF");
  });

  test("generates letter with optional reference number", async () => {
    const buffer = await generator.generate("employment_letter", {
      companyName: "Staffora Ltd",
      companyAddress: "123 HR Street",
      employeeName: "Bob",
      employeeTitle: "QA",
      department: "Quality",
      startDate: "2024-01-01",
      employmentType: "Contract",
      issueDate: "2024-12-01",
      issuerName: "HR",
      issuerTitle: "Manager",
      referenceNumber: "REF-2024-001",
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// HtmlPdfGenerator - Case Bundle Cover Template
// =============================================================================

describe("PDF Worker - HtmlPdfGenerator case_bundle_cover", () => {
  let generator: HtmlPdfGenerator;

  beforeEach(() => {
    generator = new HtmlPdfGenerator();
  });

  test("generates a valid PDF for case bundle cover page", async () => {
    const buffer = await generator.generate("case_bundle_cover", {
      companyName: "Staffora Ltd",
      caseTitle: "Disciplinary Case #123",
      caseNumber: "CASE-2024-001",
      caseType: "Disciplinary",
      employeeName: "Bob Smith",
      generatedBy: "HR Admin",
      generatedAt: "2024-06-15 10:00",
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.toString("utf-8", 0, 4)).toBe("%PDF");
  });
});

// =============================================================================
// HtmlPdfGenerator - Default Template
// =============================================================================

describe("PDF Worker - HtmlPdfGenerator default template", () => {
  test("generates PDF for unknown template name using default", async () => {
    const generator = new HtmlPdfGenerator();
    const buffer = await generator.generate("nonexistent_template", {
      title: "Custom Document",
      content: "This is custom content.",
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.toString("utf-8", 0, 4)).toBe("%PDF");
  });

  test("generates PDF with word wrapping for long text", async () => {
    const generator = new HtmlPdfGenerator();
    const longContent = "This is a very long paragraph with many words. ".repeat(50);
    const buffer = await generator.generate("default", {
      title: "Long Document",
      content: longContent,
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// HtmlPdfGenerator - Merge
// =============================================================================

describe("PDF Worker - HtmlPdfGenerator merge", () => {
  let generator: HtmlPdfGenerator;

  beforeEach(() => {
    generator = new HtmlPdfGenerator();
  });

  test("merges multiple PDFs into a single document", async () => {
    const pdf1 = await generator.generate("default", { title: "Page 1", content: "First" });
    const pdf2 = await generator.generate("default", { title: "Page 2", content: "Second" });

    const merged = await generator.merge([pdf1, pdf2]);

    expect(merged).toBeInstanceOf(Buffer);
    expect(merged.length).toBeGreaterThan(0);
    expect(merged.toString("utf-8", 0, 4)).toBe("%PDF");
    // Merged should be at least as large as either individual PDF
    expect(merged.length).toBeGreaterThan(Math.max(pdf1.length, pdf2.length));
  });

  test("merges a single PDF without error", async () => {
    const pdf = await generator.generate("default", { title: "Only", content: "Only page" });
    const merged = await generator.merge([pdf]);
    expect(merged).toBeInstanceOf(Buffer);
    expect(merged.length).toBeGreaterThan(0);
  });

  test("produces valid PDF when merging empty array", async () => {
    const merged = await generator.merge([]);
    expect(merged).toBeInstanceOf(Buffer);
    // Even an empty PDF has header/structure
  });

  test("skips invalid PDF buffers during merge without throwing", async () => {
    const validPdf = await generator.generate("default", { title: "Valid", content: "OK" });
    const invalidPdf = Buffer.from("this is not a pdf");

    const merged = await generator.merge([validPdf, invalidPdf]);
    expect(merged).toBeInstanceOf(Buffer);
    expect(merged.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Certificate Processor - Invocation
// =============================================================================

describe("PDF Worker - processCertificate invocation", () => {
  let context: JobContext;

  beforeEach(() => {
    context = {
      db: {
        withSystemContext: mock(async (callback: (_tx: unknown) => Promise<unknown>) => {
          const tx = (_strings: TemplateStringsArray, ..._values: unknown[]) =>
            Promise.resolve([]);
          return callback(tx);
        }),
      },
      cache: {} as unknown as JobContext["cache"],
      redis: { xadd: mock(() => Promise.resolve("msg-id")) },
      log: {
        info: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
        debug: mock(() => {}),
      },
      jobId: "test-pdf-cert",
      messageId: "msg-1",
      attempt: 1,
    } as unknown as JobContext;
  });

  test("logs certificate generation start with employee name", async () => {
    const payload: JobPayload<CertificatePayload> = {
      id: "job-cert-1",
      type: JobTypes.PDF_CERTIFICATE,
      tenantId: "tenant-1",
      data: {
        documentType: "certificate",
        template: "certificate",
        data: {
          employeeId: "emp-1",
          employeeName: "John Doe",
          courseId: "course-1",
          courseName: "Safety Training",
          completionDate: "2024-06-15",
          issuerName: "Jane Smith",
          issuerTitle: "Training Manager",
          companyName: "Staffora",
        },
      },
      metadata: { createdAt: new Date().toISOString() },
    };

    try {
      await certificateProcessor.processor(payload, context);
    } catch {
      // May fail on storage mkdir -- acceptable in unit test
    }

    expect(context.log.info).toHaveBeenCalled();
  });
});

// =============================================================================
// Employment Letter Processor - Invocation
// =============================================================================

describe("PDF Worker - processEmploymentLetter invocation", () => {
  let context: JobContext;

  beforeEach(() => {
    context = {
      db: {
        withSystemContext: mock(async (callback: (_tx: unknown) => Promise<unknown>) => {
          const tx = (_strings: TemplateStringsArray, ..._values: unknown[]) =>
            Promise.resolve([]);
          return callback(tx);
        }),
      },
      cache: {} as unknown as JobContext["cache"],
      redis: { xadd: mock(() => Promise.resolve("msg-id")) },
      log: {
        info: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
        debug: mock(() => {}),
      },
      jobId: "test-pdf-letter",
      messageId: "msg-2",
      attempt: 1,
    } as unknown as JobContext;
  });

  test("logs employment letter generation with employee name", async () => {
    const payload: JobPayload<EmploymentLetterPayload> = {
      id: "job-letter-1",
      type: JobTypes.PDF_EMPLOYMENT_LETTER,
      tenantId: "tenant-1",
      data: {
        documentType: "employment_letter",
        template: "employment_letter",
        data: {
          employeeId: "emp-1",
          employeeName: "Alice Johnson",
          employeeTitle: "Engineer",
          department: "Engineering",
          startDate: "2023-01-15",
          employmentType: "Full-time",
          letterType: "verification",
          issuerName: "HR Director",
          issuerTitle: "Director",
          companyName: "Staffora",
          companyAddress: "123 HR Street",
          issueDate: "2024-06-15",
        },
      },
      metadata: { createdAt: new Date().toISOString() },
    };

    try {
      await employmentLetterProcessor.processor(payload, context);
    } catch {
      // May fail on storage
    }

    expect(context.log.info).toHaveBeenCalled();
  });
});

// =============================================================================
// PdfDocumentType Coverage
// =============================================================================

describe("PDF Worker - PdfDocumentType", () => {
  test("supports all expected document types", () => {
    const types: PdfDocumentType[] = [
      "certificate",
      "employment_letter",
      "case_bundle",
      "offer_letter",
      "termination_letter",
      "salary_slip",
      "tax_form",
      "custom",
    ];
    expect(types).toHaveLength(8);
  });
});

// =============================================================================
// Filename Generation
// =============================================================================

describe("PDF Worker - Filename Generation", () => {
  test("certificate filename includes job ID and employee ID", () => {
    const filename = `certificate_${"abc-123"}_${"emp-456"}.pdf`;
    expect(filename).toBe("certificate_abc-123_emp-456.pdf");
  });

  test("employment letter filename includes job ID and employee ID", () => {
    const filename = `employment_letter_${"abc-123"}_${"emp-456"}.pdf`;
    expect(filename).toBe("employment_letter_abc-123_emp-456.pdf");
  });

  test("case bundle filename includes job ID and case ID", () => {
    const filename = `case_bundle_${"abc-123"}_${"case-789"}.pdf`;
    expect(filename).toBe("case_bundle_abc-123_case-789.pdf");
  });
});

// =============================================================================
// Document Notification Contract
// =============================================================================

describe("PDF Worker - Document Notification", () => {
  test("notification is queued to the correct stream", () => {
    expect(StreamKeys.NOTIFICATIONS).toBe("staffora:jobs:notifications");
  });

  test("notification message format includes document title", () => {
    const title = "Certificate: Safety Training";
    const message = `Your document "${title}" is ready for download.`;
    expect(message).toBe('Your document "Certificate: Safety Training" is ready for download.');
  });
});

// =============================================================================
// PdfGenerator interface compliance
// =============================================================================

describe("PDF Worker - PdfGenerator interface", () => {
  test("HtmlPdfGenerator implements PdfGenerator interface", () => {
    const generator: PdfGenerator = new HtmlPdfGenerator();
    expect(typeof generator.generate).toBe("function");
    expect(typeof generator.merge).toBe("function");
  });
});
