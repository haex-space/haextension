import type { DraftFields } from "./drafts";

/** Quiet time after the last change before a draft is written; well inside the second FR-001 allows. */
export const SAVE_DELAY_MS = 300;

export interface DraftSaver {
  /** Remember the latest fields and write them after a pause in changes. */
  change(fields: DraftFields): void;
  /** Write what is pending now. Rejects when the write failed; the fields stay pending then. */
  flush(): Promise<void>;
  /** Drop what is pending, without writing it. */
  cancel(): void;
  /** Resolves when no write is running; never rejects. */
  idle(): Promise<void>;
}

/**
 * Writes a draft once per pause in typing, never per keystroke. Writes never overlap: a change that
 * arrives while one runs is written right after it, and only the latest fields are written.
 */
export const createDraftSaver = (
  write: (fields: DraftFields) => Promise<void>,
  options: { delayMs?: number; onError?: (error: unknown) => void } = {},
): DraftSaver => {
  const delayMs = options.delayMs ?? SAVE_DELAY_MS;
  let pending: DraftFields | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Never rejects: it only orders the writes.
  let chain: Promise<void> = Promise.resolve();

  const step = async () => {
    const fields = pending;
    if (!fields) return;
    pending = null;
    try {
      await write(fields);
    } catch (err) {
      // A newer change already replaced it; otherwise keep it for the next try.
      pending ??= fields;
      throw err;
    }
  };

  const run = (): Promise<void> => {
    const result = chain.then(step);
    chain = result.catch(() => {});
    return result;
  };

  const stopTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  return {
    change(fields) {
      pending = fields;
      stopTimer();
      timer = setTimeout(() => {
        timer = null;
        run().catch((err) => options.onError?.(err));
      }, delayMs);
    },
    flush() {
      stopTimer();
      return run();
    },
    cancel() {
      stopTimer();
      pending = null;
    },
    idle: () => chain,
  };
};
