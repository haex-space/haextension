/**
 * Encode a mailbox name as an IMAP quoted string (RFC 3501). Needed for
 * the LIST pattern, which the vault sends to the server verbatim: an
 * unquoted name with a space ("Sent Messages") is a syntax error there.
 */
export const quoteImapString = (value: string) =>
  `"${value.replace(/[\\"]/g, "\\$&")}"`;

/**
 * Decode a mailbox name from IMAP's modified UTF-7 (RFC 3501 §5.1.3) for
 * display. IMAP commands keep using the raw name. A malformed run is kept
 * as it is rather than dropped.
 */
export const decodeMailboxName = (name: string): string =>
  name.replace(/&([^-]*)-/g, (run, b64: string) => {
    if (b64 === "") return "&";
    let bytes: string;
    try {
      const std = b64.replace(/,/g, "/");
      bytes = atob(std.padEnd(Math.ceil(std.length / 4) * 4, "="));
    } catch {
      return run;
    }
    if (bytes.length % 2 !== 0) return run;
    let decoded = "";
    for (let i = 0; i < bytes.length; i += 2) {
      decoded += String.fromCharCode((bytes.charCodeAt(i) << 8) | bytes.charCodeAt(i + 1));
    }
    return decoded;
  });

/**
 * Encode a mailbox name into IMAP's modified UTF-7, the inverse of `decodeMailboxName`: printable
 * ASCII stays, `&` becomes `&-`, every other run is UTF-16BE in base64 with `,` for `/`, no padding.
 */
export const encodeMailboxName = (name: string): string => {
  let out = "";
  let run = "";
  const flush = () => {
    if (!run) return;
    let bytes = "";
    for (let i = 0; i < run.length; i++) {
      bytes += String.fromCharCode(run.charCodeAt(i) >> 8, run.charCodeAt(i) & 0xff);
    }
    out += `&${btoa(bytes).replace(/=+$/, "").replace(/\//g, ",")}-`;
    run = "";
  };
  for (const ch of name) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x20 && code <= 0x7e) {
      flush();
      out += ch === "&" ? "&-" : ch;
    } else {
      run += ch;
    }
  }
  flush();
  return out;
};

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

/** The most UIDs the vault accepts in one `uidList` envelope fetch. */
export const MAX_UIDS_PER_FETCH = 1000;
