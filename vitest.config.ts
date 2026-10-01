// Unit tests run in plain Node (no Cloudflare runtime needed), so this config
// doesn't load the Cloudflare Vite plugin.
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node"
  }
});
