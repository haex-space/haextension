import { describe, expect, it, vi } from "vitest";
import type { OpenRequest } from "@haex-space/vault-sdk";
import {
  composePrefillOf,
  handleOpenRequest,
  listenForOpenRequests,
  type OpenerDeps,
} from "./openers";

const request = (over: Partial<OpenRequest["mail"]> = {}): OpenRequest => ({
  action: "mail.compose",
  mail: { to: ["ben@example.org"], cc: [], bcc: [], subject: "", body: "", ...over },
});

const deps = (hasAccounts: boolean): OpenerDeps => ({
  hasAccounts: async () => hasAccounts,
  openCompose: vi.fn(async () => {}),
  notifyNoAccount: vi.fn(),
});

describe("composePrefillOf", () => {
  it("writes every address list as the text the dialog takes", () => {
    const prefill = composePrefillOf({
      to: ["ben@example.org", "ada@example.org"],
      cc: ["cc@example.org"],
      bcc: [],
      subject: "Hallo",
      body: "Zeile 1\nZeile 2",
    });
    expect(prefill).toEqual({
      to: "ben@example.org, ada@example.org",
      cc: "cc@example.org",
      bcc: "",
      subject: "Hallo",
      body: "Zeile 1\nZeile 2",
    });
  });

  it("gives a link without a recipient an empty list", () => {
    expect(composePrefillOf(request({ to: [], subject: "Nur Betreff" }).mail).to).toBe("");
  });
});

describe("handleOpenRequest", () => {
  it("opens the dialog with the fields of the request", async () => {
    const d = deps(true);
    await handleOpenRequest(request({ subject: "Hallo" }), d);
    expect(d.openCompose).toHaveBeenCalledWith({
      to: "ben@example.org",
      cc: "",
      bcc: "",
      subject: "Hallo",
      body: "",
    });
    expect(d.notifyNoAccount).not.toHaveBeenCalled();
  });

  it("tells the person instead of opening the dialog when no account is set up", async () => {
    const d = deps(false);
    await handleOpenRequest(request(), d);
    expect(d.openCompose).not.toHaveBeenCalled();
    expect(d.notifyNoAccount).toHaveBeenCalledOnce();
  });

});

describe("listenForOpenRequests", () => {
  const fakeOpeners = (waiting: OpenRequest | null) => {
    let handler: (r: OpenRequest) => void = () => {};
    const stop = vi.fn();
    return {
      openers: {
        take: vi.fn(async () => waiting),
        onRequest: vi.fn((h: (r: OpenRequest) => void) => {
          handler = h;
          return stop;
        }),
      },
      arrive: (r: OpenRequest) => handler(r),
      stop,
    };
  };
  const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("handles the request that waited at the start", async () => {
    const handle = vi.fn(async () => {});
    const { openers } = fakeOpeners(request({ subject: "Beim Start" }));
    listenForOpenRequests(openers, handle);
    await settled();
    expect(handle).toHaveBeenCalledOnce();
    expect(handle).toHaveBeenCalledWith(request({ subject: "Beim Start" }), expect.any(Function));
  });

  it("handles a request that arrives while the extension is open", async () => {
    const handle = vi.fn(async () => {});
    const { openers, arrive } = fakeOpeners(null);
    listenForOpenRequests(openers, handle);
    await settled();
    expect(handle).not.toHaveBeenCalled();
    arrive(request({ subject: "Später" }));
    expect(handle).toHaveBeenCalledWith(request({ subject: "Später" }), expect.any(Function));
  });

  it("keeps listening when a request fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const handle = vi.fn(async () => {
      throw new Error("boom");
    });
    const { openers, arrive } = fakeOpeners(null);
    listenForOpenRequests(openers, handle);
    arrive(request());
    arrive(request());
    await settled();
    expect(handle).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("ignores an older request whose account check finishes after the newest request", async () => {
    const checks: ((hasAccounts: boolean) => void)[] = [];
    const d: OpenerDeps = {
      hasAccounts: () => new Promise((resolve) => checks.push(resolve)),
      openCompose: vi.fn(async () => {}),
      notifyNoAccount: vi.fn(),
    };
    const { openers, arrive } = fakeOpeners(null);
    listenForOpenRequests(openers, (r, isLatest) => handleOpenRequest(r, d, isLatest));

    arrive(request({ subject: "Älter" }));
    arrive(request({ subject: "Neuer" }));
    checks[1]!(true);
    await settled();
    checks[0]!(true);
    await settled();

    expect(d.openCompose).toHaveBeenCalledOnce();
    expect(d.openCompose).toHaveBeenCalledWith(expect.objectContaining({ subject: "Neuer" }));
    expect(d.notifyNoAccount).not.toHaveBeenCalled();
  });

  it("returns the function that stops listening", () => {
    const { openers, stop } = fakeOpeners(null);
    listenForOpenRequests(openers, async () => {})();
    expect(stop).toHaveBeenCalledOnce();
  });
});
