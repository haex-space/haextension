import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineNuxtConfig({

  components: [
    // Shadcn components - naked shadcn-vue components
    // Use Shadcn* prefix to access these
    {
      path: './components/shadcn',
      prefix: 'Shadcn',
      pathPrefix: true,
      extensions: ['.vue'],
      global: true,
    },
    // UI components - generic reusable components with custom UI/UX logic
    // Built on top of shadcn, usable by all apps
    // Use Ui* prefix to access these (e.g., UiDrawerModal, UiInputPassword)
    {
      path: './components/ui',
      prefix: 'Ui',
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
