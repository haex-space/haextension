import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDraftSaver } from "./draftSaver";
import type { DraftFields } from "./drafts";

const fields = (subject: string): DraftFields => ({
  accountId: "acc",
  to: "",
  cc: "",
  bcc: "",
  subject,
  bodyHtml: "",
  references: [],
  attachments: [],
});

const deferred = () => {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createDraftSaver", () => {
  it("writes once per pause, with the latest fields", async () => {
    const write = vi.fn(async () => {});
    const saver = createDraftSaver(write, { delayMs: 300 });
    saver.change(fields("a"));
    await vi.advanceTimersByTimeAsync(200);
    saver.change(fields("ab"));
    await vi.advanceTimersByTimeAsync(200);
    expect(write).not.toHaveBeenCalled();
    saver.change(fields("abc"));
    await vi.advanceTimersByTimeAsync(300);
    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(fields("abc"));
  });

  it("writes no more than once per pause while someone types for a minute", async () => {
    const write = vi.fn(async () => {});
    const saver = createDraftSaver(write, { delayMs: 300 });
    for (let i = 0; i < 300; i++) {
      saver.change(fields(String(i)));
      await vi.advanceTimersByTimeAsync(200);
    }
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(write).toHaveBeenCalledOnce();
  });

  it("flush writes at once and resolves after the write", async () => {
    const gate = deferred();
    const write = vi.fn(() => gate.promise);
    const saver = createDraftSaver(write);
    saver.change(fields("x"));
    let done = false;
    const flushed = saver.flush().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledOnce();
    expect(done).toBe(false);
    gate.resolve();
    await flushed;
    expect(done).toBe(true);
  });

  it("flush with nothing pending resolves without writing", async () => {
    const write = vi.fn(async () => {});
    await createDraftSaver(write).flush();
    expect(write).not.toHaveBeenCalled();
  });

  it("writes a change made during a write once after it, and never overlaps writes", async () => {
    const gates = [deferred(), deferred()];
    let running = 0;
    let overlapped = false;
    const write = vi.fn(async () => {
      running++;
      overlapped ||= running > 1;
      await gates[write.mock.calls.length - 1]!.promise;
      running--;
    });
    const saver = createDraftSaver(write, { delayMs: 100 });
    saver.change(fields("first"));
    await vi.advanceTimersByTimeAsync(100);
    expect(write).toHaveBeenCalledTimes(1);
    saver.change(fields("second"));
    await vi.advanceTimersByTimeAsync(100);
    expect(write).toHaveBeenCalledTimes(1);
    gates[0]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith(fields("second"));
    gates[1]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(overlapped).toBe(false);
  });

  it("rejects flush for a failing write, keeps the fields and still writes later changes", async () => {
    const write = vi
      .fn<(f: DraftFields) => Promise<void>>()
      .mockRejectedValueOnce(new Error("disk"))
      .mockResolvedValue(undefined);
    const saver = createDraftSaver(write);
    saver.change(fields("kept"));
    await expect(saver.flush()).rejects.toThrow("disk");
    await saver.flush();
    expect(write).toHaveBeenLastCalledWith(fields("kept"));
    saver.change(fields("later"));
    await saver.flush();
    expect(write).toHaveBeenLastCalledWith(fields("later"));
  });

  it("reports a failing timed write through onError", async () => {
    const onError = vi.fn();
    const saver = createDraftSaver(async () => Promise.reject(new Error("x")), { delayMs: 10, onError });
    saver.change(fields("a"));
    await vi.advanceTimersByTimeAsync(10);
    expect(onError).toHaveBeenCalledOnce();
  });

  it("cancel drops what is pending", async () => {
    const write = vi.fn(async () => {});
    const saver = createDraftSaver(write, { delayMs: 10 });
    saver.change(fields("a"));
    saver.cancel();
    await vi.advanceTimersByTimeAsync(50);
    await saver.flush();
    expect(write).not.toHaveBeenCalled();
  });
});
