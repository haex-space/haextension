import { describe, expect, it } from "vitest";
import { createMessageChangeTools, MAX_IDS, type MessageChangeDeps } from "./messageChanges";

const noSignal = { signal: new AbortController().signal };

const fakeDeps = (failFor: string[] = []) => {
  const calls: unknown[][] = [];
  const deps: MessageChangeDeps = {
    accounts: { accounts: [{ id: "a1", displayName: "Privat", email: "me@example.org" }, { id: "a2", displayName: "Arbeit", email: "w@example.org" }] },
    cachedMailboxes: async (id) =>
      id === "a1"
        ? [
            { name: "INBOX", role: "inbox", unseen: 0, exists: 0 },
            { name: "Archive", role: "archive", unseen: 0, exists: 0 },
            { name: "Steuer", role: null, unseen: 0, exists: 0 },
          ]
        : [{ name: "INBOX", role: "inbox", unseen: 0, exists: 0 }],
    changes: {
      setFlagForUidsAsync: async (account, mailbox, uids, flag, add) => {
        if (failFor.includes(account)) throw new Error("the server refused");
        calls.push(["flag", account, mailbox, uids, flag, add]);
      },
      moveUidsAsync: async (account, mailbox, uids, destination) => {
        if (failFor.includes(account)) throw new Error("the server refused");
        calls.push(["move", account, mailbox, uids, destination]);
      },
    },
  };
  return { tools: createMessageChangeTools(async () => deps), calls };
};

describe("mark_messages", () => {
  it("sets and removes the flags per mailbox, one call for all messages of it", async () => {
    const { tools, calls } = fakeDeps();
    const result = await tools.mark_messages!(
      { ids: ["a1::INBOX::1", "a1::INBOX::2", "a2::INBOX::7"], read: true, flagged: false },
      noSignal,
    );
    expect(calls).toEqual([
      ["flag", "a1", "INBOX", [1, 2], "\\Seen", true],
      ["flag", "a1", "INBOX", [1, 2], "\\Flagged", false],
      ["flag", "a2", "INBOX", [7], "\\Seen", true],
      ["flag", "a2", "INBOX", [7], "\\Flagged", false],
    ]);
    expect(result).toEqual({ done: ["a1::INBOX::1", "a1::INBOX::2", "a2::INBOX::7"], failed: [] });
  });

  it("touches only what was asked for", async () => {
    const { tools, calls } = fakeDeps();
    await tools.mark_messages!({ ids: ["a1::INBOX::1"], flagged: true }, noSignal);
    expect(calls).toEqual([["flag", "a1", "INBOX", [1], "\\Flagged", true]]);
  });

  it("fails one group with its reason and carries on with the rest", async () => {
    const { tools, calls } = fakeDeps(["a2"]);
    const result = await tools.mark_messages!(
      { ids: ["a1::INBOX::1", "a2::INBOX::7", "garbage", "zz::INBOX::3"], read: true },
      noSignal,
    );
    expect(calls).toEqual([["flag", "a1", "INBOX", [1], "\\Seen", true]]);
    expect(result).toEqual({
      done: ["a1::INBOX::1"],
      failed: [
        { id: "garbage", reason: "not a message id" },
        { id: "a2::INBOX::7", reason: "the server refused" },
        { id: "zz::INBOX::3", reason: "no such account" },
      ],
    });
  });

  it("needs a state to set and at most 100 ids", async () => {
    const { tools } = fakeDeps();
    await expect(tools.mark_messages!({ ids: ["a1::INBOX::1"] }, noSignal)).rejects.toThrow(/read or flagged/);
    await expect(tools.mark_messages!({ ids: [], read: true }, noSignal)).rejects.toThrow(/no message/);
    const many = Array.from({ length: MAX_IDS + 1 }, (_, i) => `a1::INBOX::${i + 1}`);
    await expect(tools.mark_messages!({ ids: many, read: true }, noSignal)).rejects.toThrow(/at most 100/);
  });
});

describe("move_messages", () => {
  it("moves to a role or a folder of the message's own account", async () => {
    const { tools, calls } = fakeDeps();
    expect(
      await tools.move_messages!({ ids: ["a1::INBOX::1", "a1::INBOX::2"], to: "archive" }, noSignal),
    ).toEqual({ done: ["a1::INBOX::1", "a1::INBOX::2"], failed: [] });
    await tools.move_messages!({ ids: ["a1::INBOX::3"], to: "steuer" }, noSignal);
    expect(calls).toEqual([
      ["move", "a1", "INBOX", [1, 2], "Archive"],
      ["move", "a1", "INBOX", [3], "Steuer"],
    ]);
  });

  it("fails the messages of an account that has no such mailbox, and moves the others", async () => {
    const { tools, calls } = fakeDeps();
    const result = await tools.move_messages!({ ids: ["a1::INBOX::1", "a2::INBOX::7"], to: "archive" }, noSignal);
    expect(calls).toEqual([["move", "a1", "INBOX", [1], "Archive"]]);
    expect(result).toEqual({
      done: ["a1::INBOX::1"],
      failed: [{ id: "a2::INBOX::7", reason: 'this account has no mailbox or role "archive"' }],
    });
  });

  it("counts a message that already is there as done without moving it", async () => {
    const { tools, calls } = fakeDeps();
    expect(await tools.move_messages!({ ids: ["a1::Archive::5"], to: "archive" }, noSignal)).toEqual({
      done: ["a1::Archive::5"],
      failed: [],
    });
    expect(calls).toEqual([]);
  });

  it("needs a target", async () => {
    const { tools } = fakeDeps();
    await expect(tools.move_messages!({ ids: ["a1::INBOX::1"], to: " " }, noSignal)).rejects.toThrow(/to names/);
  });
});
