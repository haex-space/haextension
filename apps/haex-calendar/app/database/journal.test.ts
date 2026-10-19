import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationsDir = fileURLToPath(new URL("./migrations", import.meta.url));

// The vault only accepts migrations listed in meta/_journal.json of the signed
// bundle, while stores/haexvault.ts registers every *.sql file it finds. A file
// missing from the journal makes the whole setup fail.
describe("migration journal", () => {
  it("lists every migration file the app registers, in order", () => {
    const journal = JSON.parse(readFileSync(`${migrationsDir}/meta/_journal.json`, "utf8")) as {
      entries: { idx: number; tag: string }[];
    };
    const files = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => name.replace(/\.sql$/, ""))
      .sort();

    expect(journal.entries.map((entry) => entry.tag)).toEqual(files);
    expect(journal.entries.map((entry) => entry.idx)).toEqual(files.map((_, i) => i));
  });
});
