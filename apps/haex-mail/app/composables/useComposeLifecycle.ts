import { watch, type Ref } from "vue";
import type { ComposePrefill } from "../lib/openers";

export interface ComposeLifecycleOptions {
  open: Ref<boolean>;
  /** Changes when a reply is asked for; the value itself is not read here. */
  replyTo: () => unknown;
  /** The fields of a mail link that wait, or `null`. */
  prefill: () => ComposePrefill | null;
  /** Takes the waiting link: returns it and clears it, so it starts one draft only. */
  takePrefill: () => ComposePrefill | null;
  startPlain: () => Promise<void>;
  startLink: (prefill: ComposePrefill) => Promise<void>;
  closed: () => Promise<void>;
  onError: (error: unknown) => void;
}

/**
 * When the compose dialog starts a mail: on opening (a plain mail, a reply, or the fields of a
 * waiting link), on a link that arrives while it is open, and on a reply asked for while it is open.
 * The starts run one after the other, and an opening that a link already started is not started
 * again, which would reset the fresh draft of the link.
 */
export const useComposeLifecycle = (options: ComposeLifecycleOptions) => {
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (job: () => Promise<void>) => {
    queue = queue.then(job).catch(options.onError);
  };

  // Whether the open dialog was started already.
  let started = false;

  const opened = async () => {
    if (started) return;
    started = true;
    const prefill = options.takePrefill();
    await (prefill ? options.startLink(prefill) : options.startPlain());
  };

  const closed = async () => {
    started = false;
    await options.closed();
  };

  // Also runs when the dialog is created already open, which a plain change watcher does not see.
  watch(options.open, (isOpen) => enqueue(isOpen ? opened : closed), { immediate: true });

  watch(options.prefill, () => {
    if (!options.open.value) return;
    const prefill = options.takePrefill();
    if (!prefill) return;
    started = true;
    enqueue(() => options.startLink(prefill));
  });

  watch(options.replyTo, (replyTo) => {
    if (options.open.value && replyTo && started) enqueue(options.startPlain);
  });
};
