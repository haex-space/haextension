import { eq } from "drizzle-orm";
import getStroke from "perfect-freehand";
import { drawings, type SelectDrawing, type SerializedStencil, type StrokeData, type ViewportState } from "~/database/schemas";
import { BRUSH_PRESETS } from "~/utils/brushPresets";

function renderStrokesToCanvas(ctx: CanvasRenderingContext2D, strokes: StrokeData[]) {
  for (const stroke of strokes) {
    if (stroke.tool === "eraser") continue;

    const preset = BRUSH_PRESETS.find((p) => p.id === stroke.brushPreset) ?? BRUSH_PRESETS[0];
    const hasPressure = stroke.points.some(p => p[2] !== 0.5);

    const outlinePoints = getStroke(stroke.points, {
      size: stroke.size,
      thinning: preset.options.thinning,
      smoothing: preset.options.smoothing,
      streamline: preset.options.streamline,
      simulatePressure: preset.options.simulatePressure && !hasPressure,
      start: preset.options.start,
      end: preset.options.end,
    });

    if (outlinePoints.length < 2) continue;

    ctx.beginPath();
    const [first, ...rest] = outlinePoints;
    if (!first) continue;
    ctx.moveTo(first[0], first[1]);
    for (const [x, y] of rest) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fillStyle = stroke.color;
    ctx.fill();
  }
}

export interface DrawingSnapshot {
  id: string;
  name: string;
  strokes: StrokeData[];
  stencils: SerializedStencil[];
  viewport: ViewportState;
}

/** Deep plain copy of reactive store data, safe to hand to the database layer. */
function plainCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function useDrawingPersistence() {
  const haexVault = useHaexVaultStore();
  const canvas = useCanvasStore();
  const stencilStore = useStencilStore();

  const requireDb = () => {
    const db = haexVault.orm;
    if (!db) throw new Error("The vault database is not initialized");
    return db;
  };

  /** Copies the open drawing in one synchronous step, so a save never mixes two states. */
  const snapshotDrawing = (): DrawingSnapshot | null => {
    if (!canvas.drawingId) return null;

    // Serialize stencils to plain objects (strip runtime state)
    const serializedStencils = stencilStore.stencils.map(s => ({
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
      imageData: s.imageData,
      emoji: s.emoji,
      zIndex: s.zIndex,
      opacity: s.opacity,
      saturation: s.saturation,
      brightness: s.brightness,
      contrast: s.contrast,
    }));

    return plainCopy({
      id: canvas.drawingId,
      name: canvas.drawingName,
      strokes: canvas.strokes,
      stencils: serializedStencils,
      viewport: canvas.viewport,
    });
  };

  const writeDrawingAsync = async (snapshot: DrawingSnapshot) => {
    const db = requireDb();
    const values = {
      name: snapshot.name,
      strokes: snapshot.strokes,
      stencils: snapshot.stencils,
      viewport: snapshot.viewport,
    };

    const existing = await db.select({ id: drawings.id }).from(drawings).where(eq(drawings.id, snapshot.id));
    if (existing.length > 0) {
      await db.update(drawings).set(values).where(eq(drawings.id, snapshot.id));
    } else {
      await db.insert(drawings).values({ id: snapshot.id, ...values });
    }
  };

  const loadAsync = async (id: string): Promise<SelectDrawing | null> => {
    const db = haexVault.orm;
    if (!db) return null;

    const result = await db.select().from(drawings).where(eq(drawings.id, id));
    return result[0] ?? null;
  };

  const listAsync = async (): Promise<SelectDrawing[]> => {
    const db = haexVault.orm;
    if (!db) return [];

    return db.select().from(drawings).orderBy(drawings.updatedAt);
  };

  const deleteAsync = async (id: string) => {
    const db = haexVault.orm;
    if (!db) return;

    await db.delete(drawings).where(eq(drawings.id, id));
  };

  const exportPngAsync = async (): Promise<Blob | null> => {
    if (canvas.strokes.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const stroke of canvas.strokes) {
      for (const [x, y] of stroke.points) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    const padding = 50;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const width = Math.ceil(maxX - minX);
    const height = Math.ceil(maxY - minY);

    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = width;
    tmpCanvas.height = height;
    const ctx = tmpCanvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.translate(-minX, -minY);

    renderStrokesToCanvas(ctx, canvas.strokes);

    return new Promise((resolve) => {
      tmpCanvas.toBlob((blob) => resolve(blob), "image/png");
    });
  };

  const writeThumbnailAsync = async (snapshot: DrawingSnapshot) => {
    if (snapshot.strokes.length === 0) return;
    const db = requireDb();

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const stroke of snapshot.strokes) {
      for (const [x, y] of stroke.points) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    const padding = 20;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const fullW = Math.ceil(maxX - minX);
    const fullH = Math.ceil(maxY - minY);

    // Scale down to max 300x200
    const maxW = 300;
    const maxH = 200;
    const scale = Math.min(maxW / fullW, maxH / fullH, 1);
    const w = Math.ceil(fullW * scale);
    const h = Math.ceil(fullH * scale);

    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = w;
    tmpCanvas.height = h;
    const ctx = tmpCanvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.scale(scale, scale);
    ctx.translate(-minX, -minY);
    renderStrokesToCanvas(ctx, snapshot.strokes);

    const thumbnail = tmpCanvas.toDataURL("image/png", 0.7);
    await db.update(drawings).set({ thumbnail }).where(eq(drawings.id, snapshot.id));
  };

  return {
    snapshotDrawing,
    writeDrawingAsync,
    writeThumbnailAsync,
    loadAsync,
    listAsync,
    deleteAsync,
    exportPngAsync,
  };
}
