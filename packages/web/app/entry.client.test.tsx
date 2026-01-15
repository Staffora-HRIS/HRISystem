import { describe, expect, it, vi } from "vitest";

const hydrateRootMock = vi.fn();
const sanitizeDocumentForReactHydrationMock = vi.fn();

vi.mock("react-dom/client", () => ({
  hydrateRoot: hydrateRootMock,
}));

vi.mock("./lib/hydration", async () => {
  const actual = await vi.importActual<typeof import("./lib/hydration")>(
    "./lib/hydration"
  );

  return {
    ...actual,
    sanitizeDocumentForReactHydration: sanitizeDocumentForReactHydrationMock,
  };
});

vi.mock("react-router/dom", () => ({
  HydratedRouter: () => null,
}));

describe("startClientHydration", () => {
  it("sanitizes the document before calling hydrateRoot", async () => {
    const fakeDocument = { name: "doc" } as unknown as Document;
    (globalThis as any).document = fakeDocument;

    // Import after mocks so the module uses our fakes.
    const mod = await import("./entry.client");
    const startClientHydration =
      (mod as any).startClientHydration ?? (mod as any).default;

    if (typeof startClientHydration !== "function") {
      throw new TypeError("startClientHydration is not a function");
    }

    startClientHydration();

    expect(sanitizeDocumentForReactHydrationMock).toHaveBeenCalledWith(fakeDocument);
    expect(hydrateRootMock).toHaveBeenCalled();

    const sanitizeOrder = sanitizeDocumentForReactHydrationMock.mock.invocationCallOrder[0];
    const hydrateOrder = hydrateRootMock.mock.invocationCallOrder[0];

    expect(sanitizeOrder).toBeLessThan(hydrateOrder);

    // Ensure we hydrate the full document (React Router full-document SSR pattern).
    expect(hydrateRootMock.mock.calls[0]?.[0]).toBe(fakeDocument);
  });
});
