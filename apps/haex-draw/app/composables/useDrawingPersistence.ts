import { eq } from "drizzle-orm";
import getStroke from "perfect-freehand";
import { drawings, type SelectDrawing, type StrokeData } from "~/database/schemas";
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
    ctx.moveTo(first[0], first[1]);
    for (const [x, y] of rest) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fillStyle = stroke.color;
    ctx.fill();
  }
}

export function useDrawingPersistence() {
  const haexVault = useHaexVaultStore();
  const canvas = useCanvasStore();
  const stencilStore = useStencilStore();

  const saveAsync = async () => {
    const db = haexVault.orm;
    if (!db || !canvas.drawingId) return;

    const data = {
      id: canvas.drawingId,
      name: canvas.drawingName,
      strokes: canvas.strokes,
      stencils: stencilStore.stencils,
      viewport: canvas.viewport,
      updatedAt: new Date(),
    };

    await db
      .insert(drawings)
      .values({ ...data, createdAt: new Date() })
      .onConflictDoUpdate({
        target: drawings.id,
        set: data,
      });

    console.log("[haex-draw] Drawing saved");
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

  return {
    saveAsync,
    loadAsync,
    listAsync,
    deleteAsync,
    exportPngAsync,
  };
}
