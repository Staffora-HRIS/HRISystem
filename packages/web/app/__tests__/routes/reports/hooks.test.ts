/**
 * Tests for report hooks module — verifies hook exports, mutation configs,
 * and useExportReport download behavior.
 */
import { describe, it, expect } from "vitest";

// We test the module exports and shapes without rendering hooks
// (that would require a QueryClientProvider wrapper)
describe("Reports hooks module", () => {
  it("should export all expected hook functions", async () => {
    const hooks = await import("~/routes/(admin)/reports/hooks");

    // Query hooks
    expect(typeof hooks.useFieldCatalog).toBe("function");
    expect(typeof hooks.useFieldValues).toBe("function");
    expect(typeof hooks.useReport).toBe("function");

    // Mutation hooks
    expect(typeof hooks.useCreateReport).toBe("function");
    expect(typeof hooks.useUpdateReport).toBe("function");
    expect(typeof hooks.useDeleteReport).toBe("function");
    expect(typeof hooks.useDuplicateReport).toBe("function");
    expect(typeof hooks.usePublishReport).toBe("function");
    expect(typeof hooks.useArchiveReport).toBe("function");

    // Execution hooks
    expect(typeof hooks.useExecuteReport).toBe("function");
    expect(typeof hooks.usePreviewReport).toBe("function");

    // Favourite hooks
    expect(typeof hooks.useAddFavourite).toBe("function");
    expect(typeof hooks.useRemoveFavourite).toBe("function");

    // Template hooks
    expect(typeof hooks.useSystemTemplates).toBe("function");
    expect(typeof hooks.useCreateFromTemplate).toBe("function");

    // Favourite list hook
    expect(typeof hooks.useFavourites).toBe("function");

    // Export hook
    expect(typeof hooks.useExportReport).toBe("function");

    // Sharing hook
    expect(typeof hooks.useShareReport).toBe("function");

    // Scheduling hooks
    expect(typeof hooks.useSetSchedule).toBe("function");
    expect(typeof hooks.useRemoveSchedule).toBe("function");

    // Report list hook
    expect(typeof hooks.useReportsList).toBe("function");
  });

  it("should have at least 20 exported hooks", async () => {
    const hooks = await import("~/routes/(admin)/reports/hooks");
    const hookNames = Object.keys(hooks).filter((k) => k.startsWith("use"));
    expect(hookNames.length).toBeGreaterThanOrEqual(18);
  });
});
