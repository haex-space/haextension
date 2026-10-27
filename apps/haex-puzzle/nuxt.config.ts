import tailwindcss from "@tailwindcss/vite";

// Development without the host: the vault SDK refuses to start outside the extension frame, so
// `HAEX_STANDALONE=1 pnpm dev` leaves it out and the app uses an in-memory library instead.
const standalone = process.env.HAEX_STANDALONE === "1";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devServer: { port: 4012 },
  devtools: { enabled: false },

  extends: ["../../packages/haex-ui"],

  vue: {
    runtimeCompiler: false,
  },

  modules: [
    "@nuxt/eslint",
    "shadcn-nuxt",
    "@nuxtjs/i18n",
    "@pinia/nuxt",
    "@nuxtjs/color-mode",
    "@nuxt/icon",
    ...(standalone ? [] : ["@haex-space/vault-sdk/nuxt"]),
  ],

  colorMode: {
    classSuffix: "",
  },

  css: ["~/assets/css/tailwind.css"],

  runtimeConfig: {
    public: {
      debug: false,
      standalone,
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
    strategy: "no_prefix",
    defaultLocale: "de",

    locales: [
      { code: "de", language: "de-DE", isCatchallLocale: true },
      { code: "en", language: "en-EN" },
    ],

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
    },
    // haex-ui's Toaster and this app's toast() must share one vue-sonner, or toasts never show.
    resolve: {
      dedupe: ["vue-sonner"],
    },
  },
});
