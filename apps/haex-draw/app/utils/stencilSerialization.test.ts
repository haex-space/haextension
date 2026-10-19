import { describe, expect, it } from "vitest";
import type { SerializedStencil } from "~/database/schemas";
import type { Stencil } from "~/types/stencil";
import { fromSerializedStencil, pickPersistedStencil } from "./stencilSerialization";

const stencil: Stencil = {
  id: "a",
  presetId: "custom",
  shapeType: "custom",
  label: "Icon",
  x: 1,
  y: 2,
  width: 30,
  height: 40,
  rotation: 0.5,
  pinned: true,
  svgPath: "M0,0 L1,1",
  svgViewBox: { x: 0, y: 0, width: 24, height: 24 },
  zIndex: 3,
  opacity: 0.5,
};

describe("stencil serialization", () => {
  it("round-trips every persisted field", () => {
    expect(fromSerializedStencil(pickPersistedStencil(stencil))).toEqual(stencil);
  });

  it("drops fields that are not part of the stored format", () => {
    const withRuntimeState = { ...stencil, dragging: true } as Stencil;
    expect(pickPersistedStencil(withRuntimeState)).not.toHaveProperty("dragging");
  });

  it("fills defaults for rows saved by older versions", () => {
    const old = { id: "b", presetId: "circle", shapeType: "circle", label: "circle", x: 0, y: 0, width: 10, height: 10 } as SerializedStencil;
    expect(fromSerializedStencil(old)).toMatchObject({ rotation: 0, pinned: false, zIndex: 0, svgViewBox: undefined });
  });

  it("falls back to a rectangle for an unknown shape type", () => {
    expect(fromSerializedStencil({ ...pickPersistedStencil(stencil), shapeType: "polygon" }).shapeType).toBe("rectangle");
  });
});
