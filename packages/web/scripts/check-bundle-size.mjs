/**
 * Bundle Size Budget Checker
 *
 * Runs the production build and checks that output asset sizes stay within
 * defined budgets. Intended to run in CI to catch bundle size regressions.
 *
 * Usage:
 *   node scripts/check-bundle-size.mjs          # build + check
 *   node scripts/check-bundle-size.mjs --skip-build   # check existing build
 *
 * Exit codes:
 *   0 = all assets within budget
 *   1 = one or more assets exceed budget
 */

import { execSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// ---------------------------------------------------------------------------
// Budget configuration (gzipped sizes are not checked here; these are raw
// on-disk sizes which are simpler to measure without extra tooling).
// Adjust these thresholds as the application grows.
// ---------------------------------------------------------------------------
const BUDGETS = {
  // Individual file budgets (raw bytes)
  maxSingleJs: 512 * 1024, // 512 KB - any single JS chunk
  maxSingleCss: 128 * 1024, // 128 KB - any single CSS file

  // Aggregate budgets
  maxTotalJs: 2 * 1024 * 1024, // 2 MB - total JS (all chunks combined)
  maxTotalCss: 256 * 1024, // 256 KB - total CSS
};

const BUILD_DIR = join(import.meta.dirname, "..", "build", "client", "assets");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function collectAssets(dir) {
  const files = [];
  try {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isFile()) {
        files.push({ name: entry, size: stat.size, path: fullPath });
      }
    }
  } catch {
    // Directory does not exist yet — build may not have run
  }
  return files;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const skipBuild = process.argv.includes("--skip-build");

if (!skipBuild) {
  console.log("Building production bundle...\n");
  try {
    execSync("react-router build", {
      cwd: join(import.meta.dirname, ".."),
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production" },
    });
  } catch {
    console.error("\nBuild failed. Cannot check bundle sizes.");
    process.exit(1);
  }
  console.log("");
}

const assets = collectAssets(BUILD_DIR);

if (assets.length === 0) {
  console.error(
    `No assets found in ${BUILD_DIR}. Did the build succeed?`
  );
  process.exit(1);
}

const jsFiles = assets.filter((f) => extname(f.name) === ".js");
const cssFiles = assets.filter((f) => extname(f.name) === ".css");
const mapFiles = assets.filter((f) => extname(f.name) === ".map");

const totalJs = jsFiles.reduce((sum, f) => sum + f.size, 0);
const totalCss = cssFiles.reduce((sum, f) => sum + f.size, 0);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log("=== Bundle Size Report ===\n");

console.log(`JS chunks: ${jsFiles.length} files, ${formatBytes(totalJs)} total`);
for (const f of jsFiles.sort((a, b) => b.size - a.size).slice(0, 10)) {
  const over = f.size > BUDGETS.maxSingleJs ? " ** OVER BUDGET **" : "";
  console.log(`  ${f.name.padEnd(50)} ${formatBytes(f.size).padStart(10)}${over}`);
}

console.log(`\nCSS files: ${cssFiles.length} files, ${formatBytes(totalCss)} total`);
for (const f of cssFiles.sort((a, b) => b.size - a.size)) {
  const over = f.size > BUDGETS.maxSingleCss ? " ** OVER BUDGET **" : "";
  console.log(`  ${f.name.padEnd(50)} ${formatBytes(f.size).padStart(10)}${over}`);
}

console.log(`\nSource maps: ${mapFiles.length} files, ${formatBytes(mapFiles.reduce((s, f) => s + f.size, 0))} total`);

console.log("\n=== Budget Check ===\n");

const violations = [];

// Check individual JS files
for (const f of jsFiles) {
  if (f.size > BUDGETS.maxSingleJs) {
    violations.push(
      `JS chunk "${f.name}" is ${formatBytes(f.size)} (budget: ${formatBytes(BUDGETS.maxSingleJs)})`
    );
  }
}

// Check individual CSS files
for (const f of cssFiles) {
  if (f.size > BUDGETS.maxSingleCss) {
    violations.push(
      `CSS file "${f.name}" is ${formatBytes(f.size)} (budget: ${formatBytes(BUDGETS.maxSingleCss)})`
    );
  }
}

// Check totals
if (totalJs > BUDGETS.maxTotalJs) {
  violations.push(
    `Total JS is ${formatBytes(totalJs)} (budget: ${formatBytes(BUDGETS.maxTotalJs)})`
  );
}

if (totalCss > BUDGETS.maxTotalCss) {
  violations.push(
    `Total CSS is ${formatBytes(totalCss)} (budget: ${formatBytes(BUDGETS.maxTotalCss)})`
  );
}

if (violations.length > 0) {
  console.log("FAILED - Bundle size budget exceeded:\n");
  for (const v of violations) {
    console.log(`  - ${v}`);
  }
  console.log(
    "\nTo investigate, run: bun run build:analyze"
  );
  console.log(
    "Then open stats.html to see the treemap visualization.\n"
  );
  process.exit(1);
} else {
  console.log("PASSED - All assets within budget.\n");
  console.log(
    `  Single JS max:  ${formatBytes(Math.max(...jsFiles.map((f) => f.size)))} / ${formatBytes(BUDGETS.maxSingleJs)}`
  );
  console.log(
    `  Total JS:       ${formatBytes(totalJs)} / ${formatBytes(BUDGETS.maxTotalJs)}`
  );
  if (cssFiles.length > 0) {
    console.log(
      `  Single CSS max: ${formatBytes(Math.max(...cssFiles.map((f) => f.size)))} / ${formatBytes(BUDGETS.maxSingleCss)}`
    );
    console.log(
      `  Total CSS:      ${formatBytes(totalCss)} / ${formatBytes(BUDGETS.maxTotalCss)}`
    );
  }
  console.log("");
}
