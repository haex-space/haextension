import { watch, type Ref } from "vue";
import type { ComposePrefill } from "../lib/openers";

/** What asks the dialog to start a mail: the fields of a mail link, or a draft to continue. */
export type ComposeRequest = { kind: "link"; prefill: ComposePrefill } | { kind: "draft"; id: string };

export interface ComposeLifecycleOptions {
  open: Ref<boolean>;
  /** Changes when a reply is asked for; the value itself is not read here. */
  replyTo: () => unknown;
  /** Changes when a request waits; the value itself is not read here. */
  request: () => unknown;
  /** Takes the waiting request: returns it and clears it, so it starts one mail only. */
  takeRequest: () => ComposeRequest | null;
  startPlain: () => Promise<void>;
  startRequest: (request: ComposeRequest) => Promise<void>;
  closed: () => Promise<void>;
  onError: (error: unknown) => void;
}

/**
 * When the compose dialog starts a mail: on opening (a plain mail, a reply, or a waiting request),
 * on a request that arrives while it is open, and on a reply asked for while it is open. The starts
 * run one after the other, and an opening that a request already started is not started again,
 * which would reset the fresh draft of the request.
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
    const request = options.takeRequest();
    await (request ? options.startRequest(request) : options.startPlain());
  };

  const closed = async () => {
    started = false;
    await options.closed();
  };

  // Also runs when the dialog is created already open, which a plain change watcher does not see.
  watch(options.open, (isOpen) => enqueue(isOpen ? opened : closed), { immediate: true });

  watch(options.request, () => {
    if (!options.open.value) return;
    const request = options.takeRequest();
    if (!request) return;
    started = true;
    enqueue(() => options.startRequest(request));
  });

  watch(options.replyTo, (replyTo) => {
    if (options.open.value && replyTo && started) enqueue(options.startPlain);
  });
};
