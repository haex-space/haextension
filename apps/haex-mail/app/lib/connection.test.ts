import { describe, expect, it } from "vitest";
import { parseConnectionSecurity, parsePort } from "./connection";

describe("parsePort", () => {
  it("accepts integer ports", () => {
    expect(parsePort("993")).toBe(993);
    expect(parsePort(" 465 ")).toBe(465);
  });

  it("rejects anything else", () => {
    for (const value of ["", "abc", "0", "65536", "99.5", "-1", undefined]) {
      expect(parsePort(value)).toBeNull();
    }
  });
});

describe("parseConnectionSecurity", () => {
  it("accepts the SDK's values only", () => {
    expect(parseConnectionSecurity("startTls")).toBe("startTls");
    expect(parseConnectionSecurity("ssl")).toBeNull();
    expect(parseConnectionSecurity("")).toBeNull();
  });
});
