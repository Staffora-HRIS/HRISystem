import type { Config } from "@react-router/dev/config";

export default {
  // Enable SSR for the application
  ssr: true,

  // Application source directory
  appDirectory: "app",

  // Build output directory
  buildDirectory: "build",

  // Enable future flags for v7+
  future: {
    // Enable relative splat paths
    unstable_optimizeDeps: true,
  },
} satisfies Config;
