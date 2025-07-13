// vite.config.ts
import { defineConfig } from "vite";
import path from "node:path";
import electron from "vite-plugin-electron/simple";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: "electron/main.ts",
      },
      preload: {
        input: path.join(__dirname, "electron/preload.ts"),
      },
      renderer: process.env.NODE_ENV === "test" ? undefined : {},
    }),
  ],

  // What: This section configures module import aliases.
  // Why: To make Vite understand that imports starting with `@/` should look in the `src/` folder.
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
