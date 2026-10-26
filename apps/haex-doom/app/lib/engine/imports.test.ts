import { describe, expect, it } from "vitest";
import { createHaexImports } from "./imports";

describe("createHaexImports", () => {
  it("reports no peer session, so the engine refuses to start a netgame", () => {
    expect(createHaexImports().netActive()).toBe(false);
  });

  it("has an empty receive queue and resolves no address", () => {
    const imports = createHaexImports();
    expect(imports.netRecv(new Uint8Array(1028))).toBe(0);
    expect(imports.netResolve("host")).toBe(-1);
  });

  it("ignores what the engine sends and reports as long as no feature handles it", () => {
    const imports = createHaexImports();
    expect(() => {
      imports.netSend(1, new Uint8Array([1, 2, 3]));
      imports.engineExit(true, "consistency failure");
      imports.fileWritten("/saves/x/doomsav0.dsg");
      imports.fileRemoved("/saves/x/doomsav0.dsg");
      imports.haptic(0);
    }).not.toThrow();
  });

  it("gives every call its own set of handlers", () => {
    expect(createHaexImports()).not.toBe(createHaexImports());
  });
});
