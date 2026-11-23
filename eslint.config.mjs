import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import convexPlugin from "@convex-dev/eslint-plugin";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...convexPlugin.configs.recommended,
  {
    // Authorization guard: public Convex functions must be built from convex/lib/functions.ts.
    files: ["convex/**/*.ts"],
    ignores: ["convex/lib/**", "convex/_generated/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "./_generated/server",
              importNames: ["query", "mutation"],
              message: "Use the role-aware builders from ./lib/functions instead.",
            },
          ],
          patterns: [
            {
              group: ["**/_generated/server"],
              importNames: ["query", "mutation"],
              message: "Use the role-aware builders from ./lib/functions instead.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "convex/_generated/**", ".convex/**", ".superpowers/**"]),
]);

export default eslintConfig;
