import { describe, expect, it } from "vitest";
import { parseStatus } from "./gitStatus";

describe("parseStatus", () => {
  it("maps porcelain codes to statuses", () => {
    expect(parseStatus(" M a.ts\n D b.ts\n?? c.ts\nA  d.ts\nD  e.ts\nM  f.ts\nMM g.ts\n")).toEqual([
      { path: "a.ts", status: "modified" },
      { path: "b.ts", status: "deleted" },
      { path: "c.ts", status: "untracked" },
      { path: "d.ts", status: "staged-added" },
      { path: "e.ts", status: "staged-deleted" },
      { path: "f.ts", status: "staged" },
      { path: "g.ts", status: "staged-modified" },
    ]);
  });

  it("uses the new path of a renamed file", () => {
    expect(parseStatus("R  old/name.ts -> new/name.ts\n")).toEqual([{ path: "new/name.ts", status: "staged" }]);
  });

  it("ignores lines that are not status entries", () => {
    expect(parseStatus("\nhint: something\n")).toEqual([]);
  });
});
