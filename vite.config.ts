import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "./src/electricity-panel-card.ts",
      formats: ["es"],
      fileName: "electricity-panel-card",
    },
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
  },
});
