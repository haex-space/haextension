import { describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import type { ComposePrefill } from "../lib/openers";
import { useComposeLifecycle } from "./useComposeLifecycle";

const link = (to: string): ComposePrefill => ({ to, cc: "", bcc: "", subject: "", body: "" });

const setup = () => {
  const open = ref(false);
  const prefill = ref<ComposePrefill | null>(null);
  const replyTo = ref<object | null>(null);
  const log: string[] = [];
  const onError = vi.fn();
  const handlers = {
    startPlain: vi.fn(async () => void log.push("plain")),
    startLink: vi.fn(async (p: ComposePrefill) => void log.push(`link:${p.to}`)),
    closed: vi.fn(async () => void log.push("closed")),
  };
  useComposeLifecycle({
    open,
    replyTo: () => replyTo.value,
    prefill: () => prefill.value,
    takePrefill: () => {
      const taken = prefill.value;
      prefill.value = null;
      return taken;
    },
    ...handlers,
    onError,
  });
  /** Lets the watchers and the queued starts run. */
  const settle = async () => {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { open, prefill, replyTo, log, onError, handlers, settle };
};

describe("useComposeLifecycle", () => {
  it("starts a plain mail when the dialog opens", async () => {
    const t = setup();
    await t.settle();
    t.log.length = 0;
    t.open.value = true;
    await t.settle();
    expect(t.log).toEqual(["plain"]);
  });

  it("starts a link that waits at opening, once and never as a plain mail", async () => {
    for (const order of ["prefill first", "open first"]) {
      const t = setup();
      await t.settle();
      t.log.length = 0;
      if (order === "prefill first") {
        t.prefill.value = link("ben@x.org");
        t.open.value = true;
      } else {
        t.open.value = true;
        t.prefill.value = link("ben@x.org");
      }
      await t.settle();
      expect(t.log, order).toEqual(["link:ben@x.org"]);
    }
  });

  it("starts a link that arrives while the dialog is open, without a plain start after it", async () => {
    const t = setup();
    t.open.value = true;
    await t.settle();
    t.log.length = 0;
    t.prefill.value = link("ben@x.org");
    await t.settle();
    expect(t.log).toEqual(["link:ben@x.org"]);
    expect(t.prefill.value).toBeNull();
  });

  it("starts each of two links in a row", async () => {
    const t = setup();
    t.open.value = true;
    await t.settle();
    t.log.length = 0;
    t.prefill.value = link("1@x.org");
    await t.settle();
    t.prefill.value = link("2@x.org");
    await t.settle();
    expect(t.log).toEqual(["link:1@x.org", "link:2@x.org"]);
  });

  it("ignores a link while the dialog is closed; the opening starts it", async () => {
    const t = setup();
    await t.settle();
    t.log.length = 0;
    t.prefill.value = link("ben@x.org");
    await t.settle();
    expect(t.log).toEqual([]);
    expect(t.prefill.value).not.toBeNull();
    t.open.value = true;
    await t.settle();
    expect(t.log).toEqual(["link:ben@x.org"]);
  });

  it("starts a reply once when it opens the dialog", async () => {
    const t = setup();
    await t.settle();
    t.log.length = 0;
    t.replyTo.value = {};
    t.open.value = true;
    await t.settle();
    expect(t.log).toEqual(["plain"]);
  });

  it("starts a reply that is asked for while the dialog is open", async () => {
    const t = setup();
    t.open.value = true;
    await t.settle();
    t.log.length = 0;
    t.replyTo.value = {};
    await t.settle();
    expect(t.log).toEqual(["plain"]);
  });

  it("does not start anything when the reply is cleared", async () => {
    const t = setup();
    t.open.value = true;
    t.replyTo.value = {};
    await t.settle();
    t.log.length = 0;
    t.replyTo.value = null;
    await t.settle();
    expect(t.log).toEqual([]);
  });

  it("reports closing, and starts again at the next opening", async () => {
    const t = setup();
    t.open.value = true;
    await t.settle();
    t.open.value = false;
    await t.settle();
    t.open.value = true;
    await t.settle();
    expect(t.log).toEqual(["closed", "plain", "closed", "plain"]);
  });

  it("goes on after a start failed", async () => {
    const t = setup();
    t.handlers.startPlain.mockRejectedValueOnce(new Error("disk"));
    t.open.value = true;
    await t.settle();
    expect(t.onError).toHaveBeenCalledWith(expect.objectContaining({ message: "disk" }));
    t.prefill.value = link("ben@x.org");
    await t.settle();
    expect(t.log).toContain("link:ben@x.org");
  });
});
