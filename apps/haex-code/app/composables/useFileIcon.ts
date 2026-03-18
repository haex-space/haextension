const EXT_ICON_MAP: Record<string, string> = {
  // TypeScript / JavaScript
  ts: "vscode-icons:file-type-typescript",
  tsx: "vscode-icons:file-type-typescriptreact",
  mts: "vscode-icons:file-type-typescript",
  cts: "vscode-icons:file-type-typescript",
  js: "vscode-icons:file-type-js",
  jsx: "vscode-icons:file-type-reactjs",
  mjs: "vscode-icons:file-type-js",
  cjs: "vscode-icons:file-type-js",
  // Vue / Svelte / Astro
  vue: "vscode-icons:file-type-vue",
  svelte: "vscode-icons:file-type-svelte",
  astro: "vscode-icons:file-type-astro",
  // Markup
  html: "vscode-icons:file-type-html",
  htm: "vscode-icons:file-type-html",
  xml: "vscode-icons:file-type-xml",
  svg: "vscode-icons:file-type-svg",
  // Styles
  css: "vscode-icons:file-type-css",
  scss: "vscode-icons:file-type-scss",
  sass: "vscode-icons:file-type-sass",
  less: "vscode-icons:file-type-less",
  // Data
  json: "vscode-icons:file-type-json",
  jsonc: "vscode-icons:file-type-json",
  json5: "vscode-icons:file-type-json",
  yaml: "vscode-icons:file-type-yaml",
  yml: "vscode-icons:file-type-yaml",
  toml: "vscode-icons:file-type-toml",
  csv: "vscode-icons:file-type-csv",
  // Docs
  md: "vscode-icons:file-type-markdown",
  mdx: "vscode-icons:file-type-mdx",
  txt: "vscode-icons:file-type-text",
  pdf: "vscode-icons:file-type-pdf",
  // Config
  env: "vscode-icons:file-type-dotenv",
  ini: "vscode-icons:file-type-ini",
  conf: "vscode-icons:file-type-config",
  lock: "vscode-icons:file-type-lock",
  // Systems
  rs: "vscode-icons:file-type-rust",
  py: "vscode-icons:file-type-python",
  go: "vscode-icons:file-type-go",
  java: "vscode-icons:file-type-java",
  kt: "vscode-icons:file-type-kotlin",
  rb: "vscode-icons:file-type-ruby",
  php: "vscode-icons:file-type-php",
  cs: "vscode-icons:file-type-csharp",
  cpp: "vscode-icons:file-type-cpp",
  c: "vscode-icons:file-type-c",
  h: "vscode-icons:file-type-h",
  // Shell
  sh: "vscode-icons:file-type-shell",
  bash: "vscode-icons:file-type-shell",
  zsh: "vscode-icons:file-type-shell",
  fish: "vscode-icons:file-type-shell",
  ps1: "vscode-icons:file-type-powershell",
  // SQL
  sql: "vscode-icons:file-type-sql",
  // Images
  png: "vscode-icons:file-type-image",
  jpg: "vscode-icons:file-type-image",
  jpeg: "vscode-icons:file-type-image",
  gif: "vscode-icons:file-type-image",
  webp: "vscode-icons:file-type-image",
  ico: "vscode-icons:file-type-image",
  bmp: "vscode-icons:file-type-image",
  // Archives
  zip: "vscode-icons:file-type-zip",
  tar: "vscode-icons:file-type-zip",
  gz: "vscode-icons:file-type-zip",
  // Dockerfile
  dockerfile: "vscode-icons:file-type-docker",
};

const NAME_ICON_MAP: Record<string, string> = {
  dockerfile: "vscode-icons:file-type-docker",
  ".dockerignore": "vscode-icons:file-type-docker",
  ".gitignore": "vscode-icons:file-type-git",
  ".gitattributes": "vscode-icons:file-type-git",
  ".gitmodules": "vscode-icons:file-type-git",
  "package.json": "vscode-icons:file-type-node",
  "package-lock.json": "vscode-icons:file-type-node",
  "pnpm-lock.yaml": "vscode-icons:file-type-node",
  "yarn.lock": "vscode-icons:file-type-node",
  "cargo.toml": "vscode-icons:file-type-cargo",
  "cargo.lock": "vscode-icons:file-type-cargo",
  "go.mod": "vscode-icons:file-type-go",
  "go.sum": "vscode-icons:file-type-go",
  ".env": "vscode-icons:file-type-dotenv",
  ".env.local": "vscode-icons:file-type-dotenv",
  ".env.example": "vscode-icons:file-type-dotenv",
  "tsconfig.json": "vscode-icons:file-type-tsconfig",
  "vite.config.ts": "vscode-icons:file-type-vite",
  "vite.config.js": "vscode-icons:file-type-vite",
  "nuxt.config.ts": "vscode-icons:file-type-nuxt",
  "nuxt.config.js": "vscode-icons:file-type-nuxt",
  "tailwind.config.ts": "vscode-icons:file-type-tailwind",
  "tailwind.config.js": "vscode-icons:file-type-tailwind",
  "eslint.config.js": "vscode-icons:file-type-eslint",
  "eslint.config.mjs": "vscode-icons:file-type-eslint",
  ".eslintrc": "vscode-icons:file-type-eslint",
  ".eslintrc.json": "vscode-icons:file-type-eslint",
  ".prettierrc": "vscode-icons:file-type-prettier",
  "readme.md": "vscode-icons:file-type-readme",
  "license": "vscode-icons:file-type-license",
  "licence": "vscode-icons:file-type-license",
};

export function useFileIcon() {
  const getFileIcon = (filename: string): string => {
    const lower = filename.toLowerCase();

    // Check full filename first (e.g. "package.json", "Dockerfile")
    if (NAME_ICON_MAP[lower]) return NAME_ICON_MAP[lower]!;

    // Check extension
    const ext = lower.split(".").pop();
    if (ext && EXT_ICON_MAP[ext]) return EXT_ICON_MAP[ext]!;

    return "vscode-icons:default-file";
  };

  return { getFileIcon };
}
