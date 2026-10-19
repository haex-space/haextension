import type { SerializedStencil } from "~/database/schemas";
import type { Stencil, StencilShapeType } from "~/types/stencil";

const SHAPE_TYPES: readonly StencilShapeType[] = [
  "rectangle", "circle", "ellipse", "star", "triangle", "heart", "hexagon", "custom", "image", "emoji",
];

const isShapeType = (value: string): value is StencilShapeType =>
  (SHAPE_TYPES as readonly string[]).includes(value);

/**
 * Copy of a stencil with only its persisted fields; anything else is runtime state and stays
 * out of the database. A `Stencil` is a valid `SerializedStencil`, so the copy can be stored as is.
 */
export function pickPersistedStencil(s: Stencil): Stencil {
  return {
    id: s.id,
    presetId: s.presetId,
    shapeType: s.shapeType,
    label: s.label,
    x: s.x,
    y: s.y,
    width: s.width,
    height: s.height,
    rotation: s.rotation,
    pinned: s.pinned,
    svgPath: s.svgPath,
    svgViewBox: s.svgViewBox,
    imageData: s.imageData,
    emoji: s.emoji,
    zIndex: s.zIndex,
    opacity: s.opacity,
    saturation: s.saturation,
    brightness: s.brightness,
    contrast: s.contrast,
  };
}

/** Rebuilds a stencil from a stored row, with defaults for fields older versions did not write. */
export function fromSerializedStencil(s: SerializedStencil): Stencil {
  return {
    id: s.id,
    presetId: s.presetId,
    // Unknown types (e.g. from a newer version) render as a plain frame.
    shapeType: isShapeType(s.shapeType) ? s.shapeType : "rectangle",
    label: s.label,
    x: s.x,
    y: s.y,
    width: s.width,
    height: s.height,
    rotation: s.rotation ?? 0,
    pinned: s.pinned ?? false,
    svgPath: s.svgPath,
    svgViewBox: s.svgViewBox,
    imageData: s.imageData,
    emoji: s.emoji,
    zIndex: s.zIndex ?? 0,
    opacity: s.opacity,
    saturation: s.saturation,
    brightness: s.brightness,
    contrast: s.contrast,
  };
}
