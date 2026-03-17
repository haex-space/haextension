import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./app/database/schemas/index.ts",
  out: "./app/database/migrations",
  dialect: "sqlite",
  verbose: true,
  strict: true,
});
