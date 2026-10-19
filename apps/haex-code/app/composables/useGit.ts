import type { EventCallback, ShellExitEvent, ShellOutputEvent } from "@haex-space/vault-sdk";
import { GitCommandError, gitCommandLine, parseGitResult, type GitResult } from "~/lib/gitOutput";

const GIT_TIMEOUT_MS = 10_000;

// Git sees a terminal, so it would page long output through `less` and wait for a key.
// HISTFILE="" keeps these commands out of the user's shell history.
const GIT_ENV = { GIT_PAGER: "cat", PAGER: "cat", GIT_TERMINAL_PROMPT: "0", HISTFILE: "" };

async function runGitCommand(
  haexVault: ReturnType<typeof useHaexVaultStore>,
  dir: string,
  args: string[]
): Promise<GitResult> {
  const shell = haexVault.client.shell;
  const { sessionId } = await shell.create({
    shell: "/bin/bash",
    cwd: dir,
    cols: 220,
    rows: 50,
    env: GIT_ENV,
  });

  return new Promise<GitResult>((resolve, reject) => {
    let screen = "";
    let settled = false;

    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      shell.offData(onOutput);
      shell.offExit(onExit);
      shell.close(sessionId).catch(() => {
        // The shell may have exited already.
      });
      settle();
    };

    // The SDK delivers shell events flattened ({ sessionId, data }), not in the HaexHubEvent
    // shape that EventCallback declares.
    const onOutput = ((event: ShellOutputEvent) => {
      if (event.sessionId !== sessionId) return;
      screen += event.data;
      const result = parseGitResult(screen);
      if (result) finish(() => resolve(result));
    }) as unknown as EventCallback;

    const onExit = ((event: ShellExitEvent) => {
      if (event.sessionId !== sessionId) return;
      finish(() => reject(new Error(`Shell exited before git ${args[0]} finished`)));
    }) as unknown as EventCallback;

    const timeout = setTimeout(
      () => finish(() => reject(new Error(`git ${args[0]} timed out`))),
      GIT_TIMEOUT_MS
    );

    shell.onData(onOutput);
    shell.onExit(onExit);
    shell.write(sessionId, gitCommandLine(dir, args)).catch((error: unknown) => finish(() => reject(error)));
  });
}

/** Runs git and throws a GitCommandError (carrying git's message) when it fails. */
async function runGitChecked(
  haexVault: ReturnType<typeof useHaexVaultStore>,
  dir: string,
  args: string[]
): Promise<string> {
  const result = await runGitCommand(haexVault, dir, args);
  if (result.exitCode !== 0) throw new GitCommandError(args, result);
  return result.output;
}

// ── Parsers ────────────────────────────────────────────────────────────────

function parseStatus(raw: string): Array<{ path: string; status: string }> {
  return raw
    .split("\n")
    .filter((l) => l.length >= 3 && /^[MADRCU? !][MADRCU? !] /.test(l))
    .map((l) => {
      const x = l[0]!;
      const y = l[1]!;
      const path = l.slice(3).trim();

      let status = "modified";
      if (x === "?" && y === "?") status = "untracked";
      else if (x !== " " && y === " ") {
        if (x === "A") status = "staged-added";
        else if (x === "D") status = "staged-deleted";
        else status = "staged";
      } else if (x !== " " && y !== " ") {
        status = "staged-modified";
      } else if (y === "M") status = "modified";
      else if (y === "D") status = "deleted";

      return { path, status };
    });
}

// ── Public API ─────────────────────────────────────────────────────────────

export function useGit() {
  const haexVault = useHaexVaultStore();

  const isRepo = async (dir: string): Promise<boolean> => {
    try {
      return await haexVault.client.filesystem.exists(`${dir}/.git`);
    } catch {
      return false;
    }
  };

  /** The checked-out branch, or null on a detached HEAD or when git cannot tell. */
  const currentBranch = async (dir: string): Promise<string | null> => {
    try {
      const out = await runGitChecked(haexVault, dir, ["branch", "--show-current"]);
      return out.trim() || null;
    } catch {
      return null;
    }
  };

  const getStatus = async (dir: string): Promise<Array<{ path: string; status: string }>> => {
    const out = await runGitChecked(haexVault, dir, ["status", "--porcelain"]);
    return parseStatus(out);
  };

  const stage = async (dir: string, filepath: string): Promise<void> => {
    await runGitChecked(haexVault, dir, ["add", "--", filepath]);
  };

  const unstage = async (dir: string, filepath: string): Promise<void> => {
    await runGitChecked(haexVault, dir, ["reset", "HEAD", "--", filepath]);
  };

  const discard = async (dir: string, filepath: string): Promise<void> => {
    await runGitChecked(haexVault, dir, ["restore", "--", filepath]);
  };

  const commit = async (dir: string, message: string): Promise<void> => {
    await runGitChecked(haexVault, dir, ["commit", "-m", message]);
  };

  /** The file as committed in HEAD, or null when HEAD has no such file. */
  const getHeadContent = async (dir: string, filepath: string): Promise<string | null> => {
    try {
      return await runGitChecked(haexVault, dir, ["show", `HEAD:${filepath}`]);
    } catch {
      return null;
    }
  };

  return { isRepo, currentBranch, getStatus, stage, unstage, discard, commit, getHeadContent };
}
