import type { MailFields, OpenersAPI, OpenRequest } from "@haex-space/vault-sdk";

/** What the fields of the compose dialog hold: address lists as the text a person types. */
export interface ComposePrefill {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
}

export const composePrefillOf = (mail: MailFields): ComposePrefill => ({
  to: mail.to.join(", "),
  cc: mail.cc.join(", "),
  bcc: mail.bcc.join(", "),
  subject: mail.subject,
  body: mail.body,
});

/** The parts of haex-mail a request needs; the plugin wires them to the stores. */
export interface OpenerDeps {
  hasAccounts: () => Promise<boolean>;
  openCompose: (prefill: ComposePrefill) => Promise<void>;
  /** Without an account the dialog cannot open, and the person is told instead of left waiting. */
  notifyNoAccount: () => void;
}

/**
 * Opens the compose dialog for a request of the host and sends nothing: the person has not written
 * the mail yet (haex-space/haex-vault@77a087a7cb8da94f8dca36fc7612d378e21b61a5:specs/063-mailto-extensions/spec.md, FR-015).
 */
export const handleOpenRequest = async (
  request: OpenRequest,
  deps: OpenerDeps,
  isLatest: () => boolean = () => true,
): Promise<void> => {
  const hasAccounts = await deps.hasAccounts();
  if (!isLatest()) return;
  if (!hasAccounts) {
    deps.notifyNoAccount();
    return;
  }
  await deps.openCompose(composePrefillOf(request.mail));
};

/**
 * Takes the request that opened this frame and every one that arrives later. The listener goes first,
 * so no request falls between the two; the host hands each request out once, so a request that both
 * see is handled once. Returns the function that stops listening.
 */
export const listenForOpenRequests = (
  openers: Pick<OpenersAPI, "take" | "onRequest">,
  handle: (request: OpenRequest, isLatest: () => boolean) => Promise<void>,
): (() => void) => {
  let latestRequest = 0;
  const run = (request: OpenRequest, order: number) =>
    handle(request, () => order === latestRequest).catch((err) =>
      console.warn("[haex-mail] an open request failed", err),
    );
  const stop = openers.onRequest((request) => {
    const order = ++latestRequest;
    void run(request, order);
  });
  openers
    .take()
    .then((request) => request && run(request, 0))
    .catch((err) => console.warn("[haex-mail] taking the open request failed", err));
  return stop;
};
