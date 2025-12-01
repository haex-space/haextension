import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineNuxtConfig({

  components: [
    // Shadcn components (pure, unmodified)
    // e.g., card/index.vue -> ShadcnCard, button/index.vue -> ShadcnButton
    {
      path: './components/shadcn',
      prefix: 'Shadcn',
      pathPrefix: true,
      extensions: ['.vue'],
      global: true,
    },
    // UI components (extended shadcn with custom logic)
    // e.g., input/index.vue -> UiInput, input/password.vue -> UiInputPassword
    {
      path: './components/ui',
      prefix: 'Ui',
      pathPrefix: true,
      extensions: ['.vue'],
      global: true,
    },
    // Haex components (app-specific, for haex-pass)
    {
      path: './components/haex',
      prefix: 'Haex',
      pathPrefix: true,
      extensions: ['.vue'],
      global: true,
    },
  ],

  alias: {
    '@/lib/utils': resolve(__dirname, './lib/utils'),
    '@/components/shadcn': resolve(__dirname, './components/shadcn'),
  },

  build: {
    transpile: ['reka-ui'],
  },
})
