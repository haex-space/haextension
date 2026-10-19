import { diffLines } from "diff";

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
