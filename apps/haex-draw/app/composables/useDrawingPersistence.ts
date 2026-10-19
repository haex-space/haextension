import { eq } from "drizzle-orm";
import { drawings, type SelectDrawing, type StrokeData, type ViewportState } from "~/database/schemas";
import type { Stencil } from "~/types/stencil";
import { rasterizeSceneAsync } from "~/utils/canvas/sceneRenderer";

export interface DrawingSnapshot {
  id: string;
  name: string;
  strokes: StrokeData[];
  stencils: Stencil[];
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
    const serializedStencils = stencilStore.stencils.map((s): Stencil => ({
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
    const image = await rasterizeSceneAsync(canvas.strokes, stencilStore.stencils, { padding: 50 });
    if (!image) return null;
    return new Promise((resolve) => image.toBlob(resolve, "image/png"));
  };

  const writeThumbnailAsync = async (snapshot: DrawingSnapshot) => {
    const db = requireDb();
    const image = await rasterizeSceneAsync(snapshot.strokes, snapshot.stencils, {
      padding: 20,
      maxWidth: 300,
      maxHeight: 200,
    });
    // An emptied drawing must not keep showing its old thumbnail.
    const thumbnail = image?.toDataURL("image/png") ?? null;
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
