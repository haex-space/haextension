import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { usePullToRefresh } from "./usePullToRefresh";

const createTarget = () => {
  const target = new EventTarget() as unknown as HTMLElement;
  Object.defineProperty(target, "scrollTop", { value: 0, writable: true });
  return target;
};

const touchEvent = (type: string, clientY: number) => {
  const event = new Event(type, { cancelable: type === "touchmove" });
  Object.defineProperty(event, "touches", {
    value: type === "touchend" ? [] : [{ clientY }],
  });
  return event;
};

const pullPastThreshold = (target: HTMLElement) => {
  target.dispatchEvent(touchEvent("touchstart", 100));
  target.dispatchEvent(touchEvent("touchmove", 250));
  target.dispatchEvent(touchEvent("touchend", 250));
};

describe("usePullToRefresh", () => {
  it("does not refresh when released below the threshold", () => {
    const target = createTarget();
    const refresh = vi.fn(async () => undefined);
    const state = usePullToRefresh(ref(target), refresh);

    target.dispatchEvent(touchEvent("touchstart", 100));
    target.dispatchEvent(touchEvent("touchmove", 200));
    target.dispatchEvent(touchEvent("touchend", 200));

    expect(refresh).not.toHaveBeenCalled();
    expect(state.distance.value).toBe(0);
  });

  it("refreshes at the top and holds the indicator until completion", async () => {
    const target = createTarget();
    let resolveRefresh!: () => void;
    const refresh = vi.fn(
      () => new Promise<void>((resolve) => (resolveRefresh = resolve)),
    );
    const state = usePullToRefresh(ref(target), refresh);

    pullPastThreshold(target);

    expect(refresh).toHaveBeenCalledOnce();
    expect(state.isRefreshing.value).toBe(true);
    expect(state.distance.value).toBe(64);

    resolveRefresh();
    await Promise.resolve();

    expect(state.isRefreshing.value).toBe(false);
    expect(state.distance.value).toBe(0);
  });

  it("ignores gestures that start while the list is scrolled", () => {
    const target = createTarget();
    target.scrollTop = 10;
    const refresh = vi.fn(async () => undefined);
    usePullToRefresh(ref(target), refresh);

    pullPastThreshold(target);

    expect(refresh).not.toHaveBeenCalled();
  });

  it("settles and reports a failed refresh without an unhandled rejection", async () => {
    const target = createTarget();
    const error = new Error("offline");
    const refresh = vi.fn(async () => {
      throw error;
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const state = usePullToRefresh(ref(target), refresh);

    pullPastThreshold(target);
    await Promise.resolve();

    expect(state.isRefreshing.value).toBe(false);
    expect(state.distance.value).toBe(0);
    expect(warn).toHaveBeenCalledWith("[haex-mail] pull-to-refresh failed", error);
    warn.mockRestore();
  });
});
