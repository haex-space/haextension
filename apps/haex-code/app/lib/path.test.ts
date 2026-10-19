import { describe, expect, it } from "vitest";
import { basename } from "./path";

describe("basename", () => {
  it("returns the last segment of a POSIX path", () => {
    expect(basename("/home/me/project/main.ts")).toBe("main.ts");
  });

  it("returns the last segment of a Windows path", () => {
    expect(basename("C:\\Users\\me\\project\\main.ts")).toBe("main.ts");
  });

  it("ignores a trailing separator", () => {
    expect(basename("/home/me/project/")).toBe("project");
  });

  it("returns a bare name unchanged", () => {
    expect(basename("Dockerfile")).toBe("Dockerfile");
  });
});
