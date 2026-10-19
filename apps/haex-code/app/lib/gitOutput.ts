// Git runs in an interactive PTY, whose screen also shows the prompt, the echoed command line
// and whatever the shell's startup files print. Markers around git's output and its exit code
// separate the result from that noise.
const BEGIN = "__HAEX_GIT_BEGIN__";
const END = "__HAEX_GIT_END__";
const END_WITH_CODE = new RegExp(`${END}:\\d`);
const END_LINE = new RegExp(`^(.*)${END}:(\\d+)$`);
// eslint-disable-next-line no-control-regex -- terminal escape sequences start with ESC (0x1b) and OSC ends with BEL (0x07)
const TERMINAL_CODES = /\x1b\[[?0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07|\r/g;

export interface GitResult {
  exitCode: number;
  /** Everything git printed (stdout and stderr share the PTY). */
  output: string;
}

export class GitCommandError extends Error {
  constructor(
    readonly args: string[],
    readonly result: GitResult,
  ) {
    super(`git ${args[0]} exited with ${result.exitCode}`);
    this.name = "GitCommandError";
  }
}

export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** The line to type into the shell to run git in `dir` and print its output between the markers. */
export function gitCommandLine(dir: string, args: string[]): string {
  const git = `git --no-pager -C ${shellEscape(dir)} ${args.map(shellEscape).join(" ")}`;
  return `echo ${BEGIN}; ${git}; echo "${END}:$?"\r`;
}

/** Git's output and exit code from the terminal text, or null while git has not finished. */
export function parseGitResult(screen: string): GitResult | null {
  if (!END_WITH_CODE.test(screen)) return null;
  const lines = screen.replace(TERMINAL_CODES, "").split("\n");
  const endIndex = lines.findIndex((line) => END_LINE.test(line));
  if (endIndex === -1) return null;
  const beginIndex = lines.lastIndexOf(BEGIN, endIndex);
  if (beginIndex === -1) return null;

  const [, lastLine = "", exitCode = ""] = END_LINE.exec(lines[endIndex]!) ?? [];
  // Text before the end marker is a last line that git printed without a trailing newline.
  const output = lines.slice(beginIndex + 1, endIndex).map((line) => `${line}\n`).join("") + lastLine;
  return { exitCode: Number(exitCode), output };
}
