import { describe, expect, it } from "vitest";
import { basename, relativePath } from "./path";

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

describe("relativePath", () => {
  it("returns the path below the root with forward slashes", () => {
    expect(relativePath("/repo", "/repo/src/main.ts")).toBe("src/main.ts");
    expect(relativePath("C:\\repo", "C:\\repo\\src\\main.ts")).toBe("src/main.ts");
  });

  it("accepts a root with a trailing separator", () => {
    expect(relativePath("/repo/", "/repo/main.ts")).toBe("main.ts");
  });

  it("returns null outside the root", () => {
    expect(relativePath("/repo", "/repository/main.ts")).toBeNull();
    expect(relativePath("/repo", "/other/main.ts")).toBeNull();
    expect(relativePath("/repo", "/repo")).toBeNull();
    expect(relativePath("/repo", "")).toBeNull();
  });
});
