import { describe, expect, it } from "vitest";

import {
  EXTENSION_INJECTED_SELECTORS,
  sanitizeDocumentForReactHydration,
} from "./hydration";

describe("sanitizeDocumentForReactHydration", () => {
  it("removes extra element children directly under document (siblings of <html>)", () => {
    const removed: string[] = [];

    const html = { nodeType: 1, tagName: "HTML" };
    const extra = {
      nodeType: 1,
      tagName: "DIV",
      remove: () => removed.push("extra"),
    };
    const doctype = { nodeType: 10 };

    const fakeDoc = {
      documentElement: html,
      childNodes: [doctype, html, extra],
    } as unknown as Document;

    sanitizeDocumentForReactHydration(fakeDoc);

    expect(removed).toEqual(["extra"]);
  });

  it("removes known extension injected nodes", () => {
    const removed: string[] = [];

    const makeNode = (id: string) => ({
      id,
      remove: () => removed.push(id),
    });

    // We don't need a real DOM implementation here; the sanitizer only relies on
    // `querySelectorAll` and `remove()`.
    const fakeDoc = {
      querySelectorAll: (selector: string) => {
        // Regression check: if the selector changes, we want this test to fail so
        // we notice and update the allowlist intentionally.
        expect(selector).toBe(EXTENSION_INJECTED_SELECTORS.join(","));

        return [
          makeNode("copyleaks-sidebar-popup"),
          makeNode("grammarly-extension"),
        ];
      },
    } as unknown as Document;

    sanitizeDocumentForReactHydration(fakeDoc);

    expect(removed).toEqual(["copyleaks-sidebar-popup", "grammarly-extension"]);
  });

  it("is a no-op when querySelectorAll is missing", () => {
    expect(() => {
      sanitizeDocumentForReactHydration({} as Document);
    }).not.toThrow();
  });

  it("does not throw if querySelectorAll throws (best-effort cleanup)", () => {
    const fakeDoc = {
      querySelectorAll: () => {
        throw new Error("selector parsing failed");
      },
    } as unknown as Document;

    expect(() => sanitizeDocumentForReactHydration(fakeDoc)).not.toThrow();
  });

  it("falls back to parentNode.removeChild when remove() is unavailable", () => {
    const removed: unknown[] = [];

    const parentNode = {
      removeChild: (node: unknown) => removed.push(node),
    };

    const nodeWithoutRemove = {
      parentNode,
    };

    const fakeDoc = {
      querySelectorAll: () => [nodeWithoutRemove],
    } as unknown as Document;

    sanitizeDocumentForReactHydration(fakeDoc);

    expect(removed).toEqual([nodeWithoutRemove]);
  });
});
