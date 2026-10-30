import { nextTick, ref, watch, type WatchSource } from "vue";
import { createDraftSaver } from "../lib/draftSaver";
import { draftHasContent, type DraftFields } from "../lib/drafts";
import type { DraftStore } from "../stores/mail/drafts";

export interface DraftAutosaveOptions {
  /** The mail as plain data (no Vue proxies): it travels to the host. */
  snapshot: () => DraftFields;
  /** Changes of these sources save the draft. */
  sources: WatchSource[];
  drafts: Pick<DraftStore, "saveAsync" | "removeAsync">;
  delayMs?: number;
  onError?: (error: unknown) => void;
}

export interface SwitchOptions {
  /** Keep the state `apply` leaves as the baseline: a mail still equal to it is not worth a draft (a reply). */
  baselineIsApplied?: boolean;
  /** The draft the fields come from; later changes go to it instead of a new one. */
  id?: string | null;
  /** Write the new mail as a draft at once, as a mail link's fields have content from the start. */
  saveNow?: boolean;
}

/**
 * Keeps the mail of the compose dialog saved as a draft (spec 022). The dialog owns the fields;
 * this watches them, writes a draft a moment after each change and when the page is hidden, and
 * starts the next draft with `switchTo`, which writes the one before first so a new mail never
 * replaces the one being written.
 */
export const useDraftAutosave = (options: DraftAutosaveOptions) => {
  const { snapshot, drafts } = options;
  const draftId = ref<string | null>(null);
  let baseline: DraftFields | null = null;
  // Muted while the dialog replaces its fields, so the old draft never sees the new mail.
  let muted = true;

  const saver = createDraftSaver(
    async (fields) => {
      draftId.value = await drafts.saveAsync(draftId.value, fields, baseline);
    },
    { delayMs: options.delayMs, onError: options.onError },
  );

  watch(
    options.sources,
    () => {
      if (!muted) saver.change(snapshot());
    },
    { flush: "sync" },
  );

  const flushQuietly = () => void saver.flush().catch((err) => options.onError?.(err));
  const onVisibility = () => {
    if (document.visibilityState === "hidden") flushQuietly();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", flushQuietly);

  /** Writes what is pending; rejects when that failed, so a caller can keep the dialog open. */
  const flushAsync = async () => {
    // A change during the first write is written by the second.
    await saver.flush();
    await saver.flush();
  };

  const hasContent = () => draftHasContent(snapshot(), baseline);

  const switchTo = async (apply: () => void | Promise<void>, switchOptions: SwitchOptions = {}) => {
    await flushAsync();
    muted = true;
    saver.cancel();
    draftId.value = switchOptions.id ?? null;
    baseline = null;
    await apply();
    await nextTick();
    if (switchOptions.baselineIsApplied) baseline = snapshot();
    muted = false;
    if (switchOptions.saveNow && hasContent()) {
      saver.change(snapshot());
      await saver.flush();
    }
  };

  /** The dialog closed: write what is pending and let go of the draft. */
  const endAsync = async () => {
    try {
      await flushAsync();
    } finally {
      muted = true;
      saver.cancel();
      draftId.value = null;
      baseline = null;
    }
  };

  /** Delete the draft of the open mail: it was sent or the person threw it away. */
  const discardAsync = async () => {
    muted = true;
    saver.cancel();
    await saver.idle();
    const id = draftId.value;
    draftId.value = null;
    baseline = null;
    if (id) await drafts.removeAsync(id);
  };

  const dispose = () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", flushQuietly);
  };

  return { draftId, hasContent, flushAsync, switchTo, endAsync, discardAsync, dispose };
};
