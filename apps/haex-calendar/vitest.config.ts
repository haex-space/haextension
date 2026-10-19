import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Date/recurrence tests assert DST behaviour, so they must not depend on the
// machine's zone. Set before the workers are spawned so they inherit it.
process.env.TZ = "Europe/Berlin";

const app = fileURLToPath(new URL("./app", import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "~": app, "@": app },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["app/**/*.test.ts"],
  },
});
