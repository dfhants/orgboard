import { defineConfig } from "vite";
import purgecss from "vite-plugin-purgecss";

export default defineConfig({
  server: {
    port: 4173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  plugins: [
    purgecss({
      content: ["index.html", "src/**/*.js", "src/**/*.mjs"],
    }),
  ],
  build: {
    target: "esnext",
    cssMinify: "lightningcss",
  },
  css: {
    transformer: "lightningcss",
  },
});
