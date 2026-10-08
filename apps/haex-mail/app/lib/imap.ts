/**
 * Encode a mailbox name as an IMAP quoted string (RFC 3501). Needed for
 * the LIST pattern, which the vault sends to the server verbatim: an
 * unquoted name with a space ("Sent Messages") is a syntax error there.
 */
export const quoteImapString = (value: string) =>
  `"${value.replace(/[\\"]/g, "\\$&")}"`;

/**
 * Orders mailbox STATUS results per mailbox. The vault opens a fresh IMAP
 * connection per call, so concurrent LIST/STATUS responses can resolve out
 * of order; a result must not overwrite counters a later-issued one has
 * already written. `issue()` before the request, `claim()` per mailbox
 * before writing its result.
 */
export const createStatusOrdering = () => {
  let lastIssued = 0;
  const lastApplied = new Map<string, number>();
  return {
    issue: () => ++lastIssued,
    claim: (mailboxId: string, seq: number) => {
      if ((lastApplied.get(mailboxId) ?? 0) > seq) return false;
      lastApplied.set(mailboxId, seq);
      return true;
    },
  };
};
