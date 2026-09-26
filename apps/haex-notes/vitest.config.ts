import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const app = fileURLToPath(new URL("./app", import.meta.url));

export default defineConfig({
  // Die Tests importieren wie die App über den Nuxt-Alias.
  resolve: {
    alias: { "~": app, "@": app },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["app/**/*.test.ts"],
  },
});
