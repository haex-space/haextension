import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devServer: { port: 4004 },
  devtools: { enabled: false },

  extends: ["../../packages/haex-ui"],

  vue: {
    runtimeCompiler: false,
  },

  shadcn: {
    componentDir: "./app/components/shadcn",
  },

  icon: {
    clientBundle: {
      icons: [
        "vscode-icons:default-file",
        "vscode-icons:default-folder",
        "vscode-icons:default-folder-opened",
        "vscode-icons:file-type-typescript",
        "vscode-icons:file-type-reactts",
        "vscode-icons:file-type-js",
        "vscode-icons:file-type-reactjs",
        "vscode-icons:file-type-vue",
        "vscode-icons:file-type-svelte",
        "vscode-icons:file-type-astro",
        "vscode-icons:file-type-html",
        "vscode-icons:file-type-xml",
        "vscode-icons:file-type-svg",
        "vscode-icons:file-type-css",
        "vscode-icons:file-type-scss",
        "vscode-icons:file-type-sass",
        "vscode-icons:file-type-less",
        "vscode-icons:file-type-json",
        "vscode-icons:file-type-yaml",
        "vscode-icons:file-type-toml",
        "vscode-icons:file-type-excel",
        "vscode-icons:file-type-markdown",
        "vscode-icons:file-type-mdx",
        "vscode-icons:file-type-text",
        "vscode-icons:file-type-pdf2",
        "vscode-icons:file-type-dotenv",
        "vscode-icons:file-type-ini",
        "vscode-icons:file-type-config",
        "vscode-icons:file-type-yarn",
        "vscode-icons:file-type-rust",
        "vscode-icons:file-type-python",
        "vscode-icons:file-type-go",
        "vscode-icons:file-type-java",
        "vscode-icons:file-type-kotlin",
        "vscode-icons:file-type-ruby",
        "vscode-icons:file-type-php",
        "vscode-icons:file-type-csharp",
        "vscode-icons:file-type-cpp",
        "vscode-icons:file-type-c",
        "vscode-icons:file-type-cheader",
        "vscode-icons:file-type-shell",
        "vscode-icons:file-type-powershell",
        "vscode-icons:file-type-sql",
        "vscode-icons:file-type-image",
        "vscode-icons:file-type-zip",
        "vscode-icons:file-type-docker",
        "vscode-icons:file-type-git",
        "vscode-icons:file-type-node",
        "vscode-icons:file-type-cargo",
        "vscode-icons:file-type-tsconfig",
        "vscode-icons:file-type-vite",
        "vscode-icons:file-type-nuxt",
        "vscode-icons:file-type-tailwind",
        "vscode-icons:file-type-eslint",
        "vscode-icons:file-type-prettier",
        "vscode-icons:file-type-license",
      ],
    },
  },

  modules: [
    "@nuxt/eslint",
    "shadcn-nuxt",
    "@nuxtjs/i18n",
    "@pinia/nuxt",
    "@nuxtjs/color-mode",
    "@nuxt/icon",
    "@haex-space/vault-sdk/nuxt",
  ],

  colorMode: {
    classSuffix: "",
  },

  css: ["~/assets/css/tailwind.css"],

  runtimeConfig: {
    public: {
      debug: true,
    },
  },

  ssr: false,

  imports: {
    dirs: [
      "composables/**",
      "stores/**",
      "components/**",
      "pages/**",
      "types/**",
    ],
  },

  i18n: {
    strategy: "prefix_and_default",
    defaultLocale: "de",

    locales: [
      { code: "de", language: "de-DE", isCatchallLocale: true },
      { code: "en", language: "en-EN" },
    ],

    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: "i18n_redirected",
      redirectOn: "root",
    },
    types: "composition",
  },

  router: {
    options: {
      hashMode: true,
    },
  },

  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ["@vueuse/core"],
      exclude: ["monaco-editor"],
    },
  },
});
