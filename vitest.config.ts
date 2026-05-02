/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: true,
    css: false,
    // antd v6 emits the `:where()` selector warning + react-refresh
    // chatter on every render — silence by default so test output is
    // readable. Override with `VITEST_VERBOSE=1` if debugging.
    silent: !process.env.VITEST_VERBOSE,
  },
});
