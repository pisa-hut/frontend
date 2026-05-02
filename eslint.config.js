import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // react-hooks v7 flags every `useEffect(() => { load(); }, [])`
      // pattern as "cascading renders". The pattern is fine for our
      // load-on-mount + SSE-refresh shape; rewriting all of them is
      // Phase 5 work, not the CI baseline. Re-enable then.
      "react-hooks/set-state-in-effect": "off",
      // Same plugin flags `Date.now()` in useMemo as impure. We use it
      // for "stuck > 2h" triage stats which are explicitly meant to
      // recompute on render. Acceptable.
      "react-hooks/purity": "off",
      // `any` is still discouraged but downgrade to warning so the
      // four existing instances in Resources.tsx don't fail CI before
      // the conventions cleanup PR types them properly.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // ThemeContext exports both a component and a hook from one file by
    // design — splitting them costs more than the fast-refresh edge
    // case is worth. Same reasoning for TasksFilters: the QuickFilter
    // type and QUICK_FILTERS const are tightly coupled to the chip-bar
    // component and only consumed by the Tasks page.
    files: ["src/components/ThemeContext.tsx", "src/components/tasks/TasksFilters.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
]);
