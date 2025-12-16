import type { App } from 'vue'
import { i18n, initI18nFromStorage } from '~/locales'

/**
 * Apply theme based on browser's color scheme preference
 */
function applyBrowserTheme() {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.classList.toggle('dark', isDark)

  // Listen for changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    document.documentElement.classList.toggle('dark', e.matches)
  })
}

export async function setupApp(app: App) {
  // Apply browser theme (dark/light mode)
  applyBrowserTheme()

  // Install vue-i18n and load saved locale from storage
  app.use(i18n)
  await initI18nFromStorage()

  // Inject a globally available `$app` object in template
  app.config.globalProperties.$app = {
    context: '' as string,
  }

  // Provide access to `app` in script setup with `const app = inject('app')`
  app.provide('app', app.config.globalProperties.$app)
}
