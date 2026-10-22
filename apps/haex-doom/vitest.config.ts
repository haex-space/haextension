import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const app = fileURLToPath(new URL("./app", import.meta.url));

export default defineConfig({
  // Tests import through the same aliases as the app.
  resolve: {
    alias: { "~": app, "@": app },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["app/**/*.test.ts"],
  },
});
