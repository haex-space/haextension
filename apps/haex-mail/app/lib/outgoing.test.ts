import type { OutgoingAttachment } from "@haex-space/vault-sdk";
import { describe, expect, it } from "vitest";
import { reactive, ref } from "vue";
import { buildOutgoingMessage } from "./outgoing";

const FROM = { email: "me@example.com", name: "Me" };

const ATTACHMENT: OutgoingAttachment = {
  filename: "a.txt",
  contentType: "text/plain",
  data: "aGk=",
};

/** What the compose dialog holds: a `ref` list and a reply prefill kept in a parent's `ref`. */
const dialogState = () => {
  const attachments = ref<OutgoingAttachment[]>([]);
  attachments.value.push({ ...ATTACHMENT });
  const replyTo = ref({
    inReplyTo: "<1@x>",
    references: ["<0@x>", "<1@x>"],
    attachments: [{ ...ATTACHMENT, filename: "fwd.txt" }],
  });
  return { attachments, replyTo };
};

describe("buildOutgoingMessage", () => {
  // The host call goes over `postMessage`; a Vue proxy in it fails there with
  // "The object can not be cloned" before the host ever sees the message.
  it("premise: the refs of the dialog hand out values the browser cannot clone", () => {
    const { attachments, replyTo } = dialogState();
    expect(() => structuredClone(attachments.value)).toThrow(/cloned/);
    expect(() => structuredClone(replyTo.value.references)).toThrow(/cloned/);
    expect(() => structuredClone(reactive({ a: 1 }))).toThrow(/cloned/);
  });

  it("returns plain data when attachments and threading come from refs", () => {
    const { attachments, replyTo } = dialogState();
    const message = buildOutgoingMessage(FROM, {
      to: "you@example.com",
      cc: "",
      bcc: "",
      subject: "Re: hi",
      bodyText: "hello",
      attachments: attachments.value,
      inReplyTo: replyTo.value.inReplyTo,
      references: replyTo.value.references,
    });

    expect(() => structuredClone(message)).not.toThrow();
    expect(structuredClone(message)).toEqual({
      from: FROM,
      to: [{ email: "you@example.com" }],
      cc: [],
      bcc: [],
      subject: "Re: hi",
      bodyText: "hello",
      attachments: [ATTACHMENT],
      inReplyTo: "<1@x>",
      references: ["<0@x>", "<1@x>"],
    });
  });

  it("returns plain data for forwarded attachments out of the reply prefill", () => {
    const { replyTo } = dialogState();
    const message = buildOutgoingMessage(FROM, {
      to: "you@example.com",
      cc: "",
      bcc: "",
      subject: "Fwd: hi",
      attachments: [...replyTo.value.attachments],
    });

    expect(() => structuredClone(message)).not.toThrow();
    expect(message.attachments).toEqual([
      { ...ATTACHMENT, filename: "fwd.txt" },
    ]);
  });

  it("leaves the caller's reactive state alone", () => {
    const { attachments } = dialogState();
    buildOutgoingMessage(FROM, {
      to: "you@example.com",
      cc: "",
      bcc: "",
      subject: "s",
      attachments: attachments.value,
    });
    attachments.value.push({ ...ATTACHMENT, filename: "later.txt" });
    expect(attachments.value.map((a) => a.filename)).toEqual(["a.txt", "later.txt"]);
  });

  it("reads \"Name <address>\" recipients and leaves invalid ones out", () => {
    const message = buildOutgoingMessage(FROM, {
      to: "Ann <ann@example.com>, nonsense",
      cc: "bob@example.com",
      bcc: "",
      subject: "s",
      attachments: [],
    });
    expect(message.to).toEqual([{ name: "Ann", email: "ann@example.com" }]);
    expect(message.cc).toEqual([{ email: "bob@example.com" }]);
    expect(message.bcc).toEqual([]);
  });

  it("sends no attachment list and no threading headers when there are none", () => {
    const message = buildOutgoingMessage(FROM, {
      to: "you@example.com",
      cc: "",
      bcc: "",
      subject: "s",
      bodyText: "x",
      bodyHtml: "<b>x</b>",
      attachments: [],
    });
    expect(message).not.toHaveProperty("attachments");
    expect(message).not.toHaveProperty("inReplyTo");
    expect(message).not.toHaveProperty("references");
    expect(message.bodyHtml).toBe("<b>x</b>");
  });
});
