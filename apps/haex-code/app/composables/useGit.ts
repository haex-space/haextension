import { diffLines } from "diff";

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[?0-9;]*[A-Za-z]/g, "").replace(/\r/g, "");
}

function shellEscape(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

const SENTINEL = "HAEX_GIT_DONE";

async function runGitCommand(
  haexVault: ReturnType<typeof useHaexVaultStore>,
  dir: string,
  args: string[]
): Promise<string> {
  let output = "";
  let settled = false;

  const { sessionId } = await haexVault.client.shell.create({
    shell: "/bin/bash",
    cwd: dir,
    cols: 220,
    rows: 50,
  });

  return new Promise<string>((resolve) => {
    const finish = (result: string) => {
      if (settled) return;
      settled = true;
      haexVault.client.shell.offData(onOutput as any);
      haexVault.client.shell.offExit(onExit as any);
      haexVault.client.shell.close(sessionId).catch(() => {});
      resolve(result);
    };

    const timeout = setTimeout(() => finish(""), 10000);

    const extractGitOutput = (stripped: string): string => {
      const lines = stripped.split("\n");
      const sentinelIdx = lines.findIndex((l) => l.trim() === SENTINEL);
      // Line 0 is command echo; lines 1..sentinelIdx-1 are git output
      const slice = sentinelIdx >= 0 ? lines.slice(1, sentinelIdx) : lines.slice(1);
      const joined = slice.join("\n");
      // Restore trailing newline lost by split/join (important for file content comparison)
      return slice.length > 0 ? joined + "\n" : joined;
    };

    const onOutput = (event: any) => {
      if (event.sessionId !== sessionId) return;
      output += event.data;
      const stripped = stripAnsi(output);
      // Sentinel appears on its own line after the command echo
      if (stripped.includes("\n" + SENTINEL)) {
        clearTimeout(timeout);
        finish(extractGitOutput(stripped));
      }
    };

    // Fallback: if the session exits before sentinel (e.g. git error)
    const onExit = (event: any) => {
      if (event.sessionId !== sessionId) return;
      clearTimeout(timeout);
      setTimeout(() => finish(extractGitOutput(stripAnsi(output))), 50);
    };

    haexVault.client.shell.onData(onOutput as any);
    haexVault.client.shell.onExit(onExit as any);

    const cmd = `git -C ${shellEscape(dir)} ${args.map(shellEscape).join(" ")} ; echo ${SENTINEL}\r`;
    haexVault.client.shell.write(sessionId, cmd);
  });
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

function parseBranch(raw: string): string | null {
  const lines = raw.split("\n").map((l) => l.trim());
  const candidates = lines.filter((l) => l && /^[a-zA-Z0-9._\-/]+$/.test(l));
  return candidates[candidates.length - 1] ?? null;
}

// ── Gutter diff helper ─────────────────────────────────────────────────────

export type GitLineChange = { line: number; type: "added" | "modified" | "deleted" };

export function computeLineChanges(headContent: string, currentContent: string): GitLineChange[] {
  const changes = diffLines(headContent, currentContent);
  const result: GitLineChange[] = [];
  let currentLine = 1;
  let i = 0;

  while (i < changes.length) {
    const change = changes[i]!;

    if (!change.added && !change.removed) {
      currentLine += change.count ?? 0;
      i++;
    } else if (change.removed) {
      const removedCount = change.count ?? 0;
      const next = changes[i + 1];
      if (next?.added) {
        const addedCount = next.count ?? 0;
        const modifiedCount = Math.min(removedCount, addedCount);
        for (let j = 0; j < modifiedCount; j++) result.push({ line: currentLine + j, type: "modified" });
        for (let j = modifiedCount; j < addedCount; j++) result.push({ line: currentLine + j, type: "added" });
        if (removedCount > addedCount) result.push({ line: currentLine + addedCount - 1, type: "deleted" });
        currentLine += addedCount;
        i += 2;
      } else {
        result.push({ line: Math.max(1, currentLine), type: "deleted" });
        i++;
      }
    } else if (change.added) {
      for (let j = 0; j < (change.count ?? 0); j++) result.push({ line: currentLine + j, type: "added" });
      currentLine += change.count ?? 0;
      i++;
    }
  }

  return result;
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

  const currentBranch = async (dir: string): Promise<string | null> => {
    try {
      const out = await runGitCommand(haexVault, dir, ["branch", "--show-current"]);
      return parseBranch(out);
    } catch {
      return null;
    }
  };

  const getStatus = async (dir: string): Promise<Array<{ path: string; status: string }>> => {
    try {
      const out = await runGitCommand(haexVault, dir, ["status", "--porcelain"]);
      return parseStatus(out);
    } catch {
      return [];
    }
  };

  const stage = async (dir: string, filepath: string): Promise<void> => {
    await runGitCommand(haexVault, dir, ["add", filepath]);
  };

  const unstage = async (dir: string, filepath: string): Promise<void> => {
    await runGitCommand(haexVault, dir, ["reset", "HEAD", filepath]);
  };

  const discard = async (dir: string, filepath: string): Promise<void> => {
    await runGitCommand(haexVault, dir, ["restore", filepath]);
  };

  const commit = async (dir: string, message: string): Promise<void> => {
    await runGitCommand(haexVault, dir, ["commit", "-m", message]);
  };

  const getHeadContent = async (dir: string, filepath: string): Promise<string | null> => {
    try {
      const out = await runGitCommand(haexVault, dir, ["show", `HEAD:${filepath}`]);
      return out || null;
    } catch {
      return null;
    }
  };

  return { isRepo, currentBranch, getStatus, stage, unstage, discard, commit, getHeadContent };
}
