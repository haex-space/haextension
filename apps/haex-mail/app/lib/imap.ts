/**
 * Encode a mailbox name as an IMAP quoted string (RFC 3501). Needed for
 * the LIST pattern, which the vault sends to the server verbatim: an
 * unquoted name with a space ("Sent Messages") is a syntax error there.
 */
export const quoteImapString = (value: string) =>
  `"${value.replace(/[\\"]/g, "\\$&")}"`;
