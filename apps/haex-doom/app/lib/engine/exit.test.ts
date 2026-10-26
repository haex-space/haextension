import { describe, expect, it, vi } from "vitest";
import { recordEngineExit, type EngineExit } from "./exit";
import { createHaexImports } from "./imports";

describe("recordEngineExit", () => {
  it("records an error with its text and without the trailing line break", () => {
    const recorded: EngineExit[] = [];
    const imports = recordEngineExit(createHaexImports(), (exit) => recorded.push(exit));
    imports.engineExit(true, "consistency failure (81 should be 92)\n");
    expect(recorded).toEqual([{ isError: true, message: "consistency failure (81 should be 92)" }]);
  });

  it("records a plain Quit and a notice", () => {
    const recorded: EngineExit[] = [];
    const imports = recordEngineExit(createHaexImports(), (exit) => recorded.push(exit));
    imports.engineExit(false, "");
    imports.engineExit(false, "Disconnected from the host.");
    expect(recorded).toEqual([
      { isError: false, message: "" },
      { isError: false, message: "Disconnected from the host." },
    ]);
  });

  it("still calls the handler of the feature that owns the exit", () => {
    const own = vi.fn();
    const imports = recordEngineExit({ ...createHaexImports(), engineExit: own }, () => {});
    imports.engineExit(true, "x\n");
    expect(own).toHaveBeenCalledWith(true, "x\n");
  });

  it("leaves the other imports as they were", () => {
    const base = createHaexImports();
    const imports = recordEngineExit(base, () => {});
    expect(imports.netSend).toBe(base.netSend);
    expect(imports.netActive).toBe(base.netActive);
  });
});
