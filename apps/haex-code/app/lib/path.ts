/** Last segment of a path; hosts on Windows separate with `\`. */
export function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}
