import type { OutgoingAttachment, OutgoingMessage } from "@haex-space/vault-sdk";
import { parseAddressList } from "./address";

export interface OutgoingFields {
  /** Address lists as typed into the compose form; invalid entries are left out. */
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments: OutgoingAttachment[];
  /** Threading headers of a reply. */
  inReplyTo?: string;
  references?: string[];
}

/**
 * The message for the host, as plain data.
 *
 * A host call goes over `postMessage`, which refuses a Vue proxy ("The object can not be
 * cloned") inside the extension, before the host sees anything. The compose form hands out
 * proxies: its `ref` list of attachments and the reply prefill kept in the parent's `ref`.
 * The JSON round trip reads through them, and every field of an `OutgoingMessage` is JSON.
 */
export const buildOutgoingMessage = (
  from: OutgoingMessage["from"],
  fields: OutgoingFields,
): OutgoingMessage =>
  JSON.parse(
    JSON.stringify({
      from,
      to: parseAddressList(fields.to).addresses,
      cc: parseAddressList(fields.cc).addresses,
      bcc: parseAddressList(fields.bcc).addresses,
      subject: fields.subject,
      bodyText: fields.bodyText,
      bodyHtml: fields.bodyHtml,
      attachments: fields.attachments.length ? fields.attachments : undefined,
      inReplyTo: fields.inReplyTo,
      references: fields.references,
    } satisfies OutgoingMessage),
  ) as OutgoingMessage;
