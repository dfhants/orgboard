import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 4173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    target: "esnext",
    cssMinify: "lightningcss",
  },
  css: {
    transformer: "lightningcss",
  },
});
