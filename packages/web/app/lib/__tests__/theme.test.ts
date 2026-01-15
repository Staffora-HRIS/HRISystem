import { describe, expect, it } from "vitest";

import { getInitialResolvedTheme, parseTheme } from "../theme";

describe("theme helpers", () => {
  it("parseTheme returns valid theme values and rejects invalid", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("system")).toBe("system");
    expect(parseTheme("nope")).toBe(null);
    expect(parseTheme(null)).toBe(null);
    expect(parseTheme(undefined)).toBe(null);
  });

  it("getInitialResolvedTheme never resolves system during initial render", () => {
    expect(getInitialResolvedTheme("light")).toBe("light");
    expect(getInitialResolvedTheme("dark")).toBe("dark");
    expect(getInitialResolvedTheme("system")).toBe("light");
  });
});
