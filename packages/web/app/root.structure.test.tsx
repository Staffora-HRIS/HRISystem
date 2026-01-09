import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("@tanstack/react-query-devtools", () => ({
  ReactQueryDevtools: () => null,
}));

describe("root App structure", () => {
  it("renders ReactQueryDevtools only under Document (never as sibling of <html>)", async () => {
    const { default: App } = await import("./root");
    const { ReactQueryDevtools } = await import("@tanstack/react-query-devtools");

    const tree = App() as unknown as ReactElement;

    const badPaths: string[] = [];

    function walk(node: any, path: string, insideDocument: boolean) {
      if (!node) return;

      if (Array.isArray(node)) {
        node.forEach((child, i) => walk(child, `${path}[${i}]`, insideDocument));
        return;
      }

      if (typeof node !== "object" || !("type" in node)) return;

      const nextInsideDocument =
        insideDocument ||
        (typeof node.type === "function" && node.type.name === "Document");

      if (node.type === ReactQueryDevtools && !nextInsideDocument) {
        badPaths.push(path);
      }

      walk(node.props?.children, `${path}.children`, nextInsideDocument);
    }

    walk(tree, "App", false);

    expect(badPaths).toEqual([]);
  });
});
