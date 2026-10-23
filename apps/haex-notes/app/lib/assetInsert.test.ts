import { drizzle } from "drizzle-orm/sqlite-proxy";
import { describe, expect, it } from "vitest";
import { insertAssetIfNew } from "./assetInsert";

const db = drizzle(async () => ({ rows: [] }));

describe("insertAssetIfNew", () => {
  const { sql: statement, params } = insertAssetIfNew(db, {
    id: "a1", sha256: "ab".repeat(32), fileName: "seite.jpg", mimeType: "image/jpeg", size: 3,
  }).toSQL();

  it("names the conflict column without the table, the only form the vault's SQL check reads", () => {
    expect(statement).toMatch(/ on conflict \("sha256"\) do nothing$/);
    expect(statement).not.toMatch(/on conflict \([^)]*\./);
  });

  it("keeps the values as parameters", () => {
    expect(params).toEqual(["a1", "ab".repeat(32), "seite.jpg", "image/jpeg", 3]);
  });
});
