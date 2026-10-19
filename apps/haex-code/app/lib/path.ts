/** Last segment of a path; hosts on Windows separate with `\`. */
export function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** `path` relative to `root` with `/` separators (as git expects), or null when it is not inside `root`. */
export function relativePath(root: string, path: string): string | null {
  const base = root.replace(/[\\/]+$/, "");
  if (!path.startsWith(base)) return null;
  const rest = path.slice(base.length);
  if (!/^[\\/]./.test(rest)) return null;
  return rest.slice(1).replace(/\\/g, "/");
}
