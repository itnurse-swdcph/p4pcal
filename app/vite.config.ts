import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Vercel exposes the deployment commit SHA; the fallback keeps local builds unique.
const buildId = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || `local-${Date.now()}`;

export default defineConfig({
  base: './',
  define: { __P4P_BUILD_ID__: JSON.stringify(buildId) },
  plugins: [
    react(),
    {
      name: "p4p-version-manifest",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify({ buildId, builtAt: new Date().toISOString() }),
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
