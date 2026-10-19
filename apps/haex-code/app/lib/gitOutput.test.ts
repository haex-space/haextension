import { describe, expect, it } from "vitest";
import { gitCommandLine, parseGitResult } from "./gitOutput";

const BEGIN = "__HAEX_GIT_BEGIN__";
const END = "__HAEX_GIT_END__";

/** What the PTY shows: prompt, the echoed command (sometimes twice), git's output, the end marker, the next prompt. */
function screen(body: string, exitCode: number): string {
  const echoed = gitCommandLine("/repo", ["status"]).replace("\r", "");
  return [
    "\x1b]0;me@host: /repo\x07me@host:/repo$ " + echoed,
    echoed,
    BEGIN,
    `${body}${END}:${exitCode}`,
    "me@host:/repo$ ",
  ].join("\r\n");
}

describe("gitCommandLine", () => {
  it("quotes the directory and every argument", () => {
    expect(gitCommandLine("/my repo", ["commit", "-m", "it's done"])).toBe(
      `echo ${BEGIN}; git --no-pager -C '/my repo' 'commit' '-m' 'it'\\''s done'; echo "${END}:$?"\r`,
    );
  });
});

describe("parseGitResult", () => {
  it("returns null until the end marker with an exit code arrived", () => {
    const echoed = gitCommandLine("/repo", ["status"]);
    expect(parseGitResult(`me@host:/repo$ ${echoed}\r\n${BEGIN}\r\n M a.ts\r\n`)).toBeNull();
  });

  it("returns only git's output, without prompt and command echo", () => {
    expect(parseGitResult(screen(" M a.ts\r\n?? b.ts\r\n", 0))).toEqual({
      exitCode: 0,
      output: " M a.ts\n?? b.ts\n",
    });
  });

  it("keeps a last line without trailing newline", () => {
    expect(parseGitResult(screen("line 1\r\nlast", 0))).toEqual({ exitCode: 0, output: "line 1\nlast" });
  });

  it("returns empty output for an empty file", () => {
    expect(parseGitResult(screen("", 0))).toEqual({ exitCode: 0, output: "" });
  });

  it("reports a failing exit code with git's message", () => {
    expect(parseGitResult(screen("fatal: path 'x' does not exist in 'HEAD'\r\n", 128))).toEqual({
      exitCode: 128,
      output: "fatal: path 'x' does not exist in 'HEAD'\n",
    });
  });

  it("strips colour escape sequences", () => {
    expect(parseGitResult(screen("\x1b[31mred\x1b[m\r\n", 0))?.output).toBe("red\n");
  });
});
