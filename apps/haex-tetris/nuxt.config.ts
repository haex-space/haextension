import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devServer: { port: 4008 },
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
    },
  },
});
