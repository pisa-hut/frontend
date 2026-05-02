import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [
    react(),
    // Bundle visualizer: emits dist/stats.html alongside the build.
    // Hidden behind ANALYZE=1 so the default `npm run build` stays
    // lean; `npm run build:analyze` opens it after build.
    process.env.ANALYZE
      ? visualizer({ filename: "dist/stats.html", gzipSize: true, brotliSize: true })
      : undefined,
  ],
  build: {
    rolldownOptions: {
      output: {
        // Manual chunks split heavy / rarely-changing third-party
        // bundles into their own files. The browser caches each
        // chunk independently so a one-line app fix doesn't
        // re-download all of antd / icons / react-dom.
        manualChunks: (id: string) => {
          if (id.includes("node_modules/@ant-design/icons")) return "antd-icons";
          if (id.includes("node_modules/antd")) return "antd";
          if (
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react-router-dom") ||
            id.includes("node_modules/react/")
          ) {
            return "react";
          }
          return undefined;
        },
      },
    },
    // The chunk-size warning hits on antd unavoidably; bump to 600k
    // gzipped so we don't get spammed about a single legitimate
    // vendor split.
    chunkSizeWarningLimit: 600,
  },
  server: {
    proxy: {
      "/manager": {
        target: "http://127.0.0.1:7777",
        changeOrigin: true,
      },
    },
  },
});
