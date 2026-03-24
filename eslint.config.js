import js from "@eslint/js";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.react-router/**",
      "**/coverage/**",
      "**/src/tests-legacy/**",
      "**/src/test/load/**",
      "**/src/test/performance/**",
      "**/src/test/chaos/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      ...tsPlugin.configs.recommended.rules,
      "no-control-regex": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/ban-ts-comment": "warn",
      "no-redeclare": "off",
      "no-useless-escape": "warn",
      "no-constant-binary-expression": "warn",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "warn",
      "@typescript-eslint/no-require-imports": "warn",
    },
  },
  {
    files: ["packages/web/**/*.ts", "packages/web/**/*.tsx"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
];
