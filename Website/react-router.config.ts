import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  appDirectory: "app",
  buildDirectory: "build",
  future: {
    unstable_optimizeDeps: true,
  },
} satisfies Config;
