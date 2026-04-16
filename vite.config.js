import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
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
    preact({ devToolsEnabled: false }),
    purgecss({
      content: ["index.html", "src/**/*.js", "src/**/*.mjs", "src/**/*.jsx"],
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
