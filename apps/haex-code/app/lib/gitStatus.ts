export type GitStatus =
  | "modified"
  | "deleted"
  | "untracked"
  | "staged-added"
  | "staged-modified"
  | "staged-deleted"
  | "staged";

export interface GitFileStatus {
  /** Relative to the repository root, with `/` separators. */
  path: string;
  status: GitStatus;
}

export const GIT_STATUS_LABEL: Record<GitStatus, string> = {
  modified: "M",
  deleted: "D",
  untracked: "U",
  "staged-added": "A",
  "staged-modified": "M",
  "staged-deleted": "D",
  staged: "M",
};

export const GIT_STATUS_COLOR: Record<GitStatus, string> = {
  modified: "text-yellow-500",
  deleted: "text-red-500",
  untracked: "text-green-500",
  "staged-added": "text-green-500",
  "staged-modified": "text-yellow-500",
  "staged-deleted": "text-red-500",
  staged: "text-yellow-500",
};

export function isStaged(status: GitStatus): boolean {
  return status.startsWith("staged");
}

/** Files from `git status --porcelain` (v1) output. */
export function parseStatus(raw: string): GitFileStatus[] {
  return raw
    .split("\n")
    .filter((l) => l.length >= 3 && /^[MADRCU? !][MADRCU? !] /.test(l))
    .map((l) => {
      const x = l[0]!;
      const y = l[1]!;
      // Renames and copies are listed as "old -> new".
      const path = l.slice(3).trim().split(" -> ").pop()!;

      let status: GitStatus = "modified";
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
