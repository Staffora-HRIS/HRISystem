import { describe, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const routesDir = fileURLToPath(new URL("../routes", import.meta.url));
const forbidden = "This page is under construction.";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (entry.isFile()) out.push(full);
  }
  return out;
}

describe("Route placeholder guard", () => {
  it("does not allow the placeholder text in app/routes", () => {
    const files = walk(routesDir).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    const offenders: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      if (content.includes(forbidden)) {
        offenders.push(path.relative(routesDir, file));
      }
    }

    if (offenders.length > 0) {
      throw new Error(`Forbidden placeholder text found in:\n${offenders.join("\n")}`);
    }
  });
});
