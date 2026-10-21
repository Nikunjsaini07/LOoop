import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".vinext/**",
    ".wrangler/**",
    ".sites-runtime/**",
    "dist/**",
    "outputs/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Retained starter sources are omitted from the clean release archive.
    "vendor/**", "examples/**", "components/ui/**", "hooks/**",
    "components/connector-error.tsx", "lib/connector*.{ts,mts}", "lib/connectors.ts", "lib/utils.ts",
    "scripts/connector-preview/**", "scripts/npm-install.mjs", "scripts/pnpm-install.mjs", "scripts/execution-profile.mjs",
    "postcss.config.mjs",
  ]),
  {
    files: ["components/ui/**/*.{ts,tsx}", "hooks/use-mobile.ts"],
    rules: {
      // These files are vendored verbatim from shadcn@4.17.0. Keep the
      // registry source intact while applying the stricter rules to Site code.
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
