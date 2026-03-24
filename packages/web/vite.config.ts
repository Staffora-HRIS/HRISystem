import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => ({
  plugins: [
    mode === "test" || process.env.STORYBOOK ? null : reactRouter(),
    tsconfigPaths(),
    // Bundle analysis: run `bun run build:analyze` to generate stats.html
    mode !== "test" && process.env.VITE_BUNDLE_ANALYZE === "true"
      ? (async () => {
          const { visualizer } = await import("rollup-plugin-visualizer");
          return visualizer({
            filename: "stats.html",
            open: false,
            gzipSize: true,
            brotliSize: true,
            template: "treemap",
          });
        })()
      : null,
  ].filter(Boolean),
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: true,
  },
  // Fix: Deduplicate React to prevent "Invalid hook call" errors
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  // Pre-bundle better-auth dependencies
  optimizeDeps: {
    include: ["better-auth/react", "better-auth/client/plugins"],
  },
  // Vitest configuration — exclude Playwright E2E tests
  test: {
    environment: "jsdom",
    exclude: ["node_modules", "build", "e2e/**"],
    alias: {
      "~/": new URL("./app/", import.meta.url).pathname,
    },
  },
}));
