import { describe, it, expect } from "vitest";
import { isSafeRedirectPath } from "../url-safety";

describe("isSafeRedirectPath", () => {
  it("accepts valid relative paths", () => {
    expect(isSafeRedirectPath("/dashboard")).toBe(true);
    expect(isSafeRedirectPath("/settings/profile")).toBe(true);
    expect(isSafeRedirectPath("/a/b/c?q=1")).toBe(true);
    expect(isSafeRedirectPath("/")).toBe(true);
  });

  it("rejects absolute URLs to external domains", () => {
    expect(isSafeRedirectPath("https://evil.com")).toBe(false);
    expect(isSafeRedirectPath("http://evil.com")).toBe(false);
    expect(isSafeRedirectPath("ftp://evil.com")).toBe(false);
  });

  it("rejects protocol-relative URLs", () => {
    expect(isSafeRedirectPath("//evil.com")).toBe(false);
    expect(isSafeRedirectPath("//evil.com/path")).toBe(false);
  });

  it("rejects backslash after leading slash (browser normalisation attack)", () => {
    expect(isSafeRedirectPath("/\\evil.com")).toBe(false);
  });

  it("rejects empty strings and non-slash-prefixed values", () => {
    expect(isSafeRedirectPath("")).toBe(false);
    expect(isSafeRedirectPath("dashboard")).toBe(false);
    expect(isSafeRedirectPath("evil.com")).toBe(false);
  });
});
