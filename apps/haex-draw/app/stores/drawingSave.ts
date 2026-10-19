/**
 * Tracks unsaved changes of the open drawing and serializes its writes.
 * Every edit bumps `revision`; a finished save only clears the revision it actually wrote,
 * so edits made while a save is in flight stay pending.
 */
export const useDrawingSaveStore = defineStore("drawingSave", () => {
  const canvas = useCanvasStore();
  const stencilStore = useStencilStore();
  const { snapshotDrawing, writeDrawingAsync, writeThumbnailAsync } = useDrawingPersistence();

  const revision = ref(0);
  const savedRevision = ref(0);

  const markDirty = () => {
    revision.value++;
  };

  // Committed strokes are immutable, so identity, length and cursor cover every history change.
  watch(
    [() => canvas.history, () => canvas.history.length, () => canvas.historyIndex, () => canvas.drawingName],
    markDirty,
  );
  watch(() => stencilStore.stencils, markDirty, { deep: true });

  /** Declares the current state as persisted, e.g. right after a drawing was loaded. */
  const markSavedAsync = async () => {
    // The watchers run before the next render; let them see the load first.
    await nextTick();
    savedRevision.value = revision.value;
  };

  const writePendingAsync = async () => {
    if (revision.value === savedRevision.value) return;
    const target = revision.value;
    const snapshot = snapshotDrawing();
    if (!snapshot) return;

    await writeDrawingAsync(snapshot);
    savedRevision.value = Math.max(savedRevision.value, target);
    await writeThumbnailAsync(snapshot);
  };

  let queue: Promise<Error | null> = Promise.resolve(null);

  /**
   * Writes pending changes once any save already in flight has finished.
   * Resolves with the failure instead of rejecting, so unmount and page-hide handlers can fire and forget.
   */
  const saveAsync = (): Promise<Error | null> => {
    queue = queue
      .then(writePendingAsync)
      .then(
        () => null,
        (error: unknown) => error instanceof Error ? error : new Error("Saving the drawing failed", { cause: error }),
      );
    return queue;
  };

  /** Resolves once every save started so far has finished. */
  const whenIdleAsync = async () => {
    await queue;
  };

  return { markSavedAsync, saveAsync, whenIdleAsync };
});
