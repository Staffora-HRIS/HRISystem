import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../app/components/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-essentials", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (config) => {
    // Reuse the project's Vite tsconfig paths plugin so the ~ alias works
    const tsconfigPaths = (await import("vite-tsconfig-paths")).default;

    config.plugins = [...(config.plugins ?? []), tsconfigPaths()];

    // Deduplicate React to prevent "Invalid hook call" errors
    config.resolve = {
      ...config.resolve,
      dedupe: [...(config.resolve?.dedupe ?? []), "react", "react-dom"],
    };

    return config;
  },
};

export default config;
