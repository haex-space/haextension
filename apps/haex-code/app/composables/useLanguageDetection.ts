const EXTENSION_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  vue: "html",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  json: "json",
  jsonc: "json",
  md: "markdown",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  svg: "xml",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  c: "c",
  cpp: "cpp",
  h: "cpp",
  hpp: "cpp",
  cs: "csharp",
  rb: "ruby",
  php: "php",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  ps1: "powershell",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  dockerfile: "dockerfile",
  toml: "ini",
  ini: "ini",
  conf: "ini",
  env: "ini",
  lua: "lua",
  r: "r",
  swift: "swift",
  dart: "dart",
  zig: "zig",
};

const FILENAME_MAP: Record<string, string> = {
  Dockerfile: "dockerfile",
  Makefile: "makefile",
  Containerfile: "dockerfile",
  ".gitignore": "ini",
  ".dockerignore": "ini",
  ".editorconfig": "ini",
  ".env": "ini",
  ".env.local": "ini",
};

export function useLanguageDetection() {
  const detectLanguage = (filePath: string): string => {
    const fileName = filePath.split("/").pop() || "";

    if (FILENAME_MAP[fileName]) return FILENAME_MAP[fileName];

    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    return EXTENSION_MAP[ext] || "plaintext";
  };

  return { detectLanguage };
}
