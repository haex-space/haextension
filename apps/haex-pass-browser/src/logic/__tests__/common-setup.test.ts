import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { setupApp } from '../common-setup'

vi.mock('~/locales', () => ({
  i18n: { install: () => {} },
  initI18nFromStorage: async () => {},
}))

beforeEach(() => {
  document.documentElement.className = ''
  window.matchMedia = vi.fn(() => ({ matches: true, addEventListener: vi.fn() })) as unknown as typeof window.matchMedia
})

describe('setupApp', () => {
  it('follows the browser theme on extension pages', async () => {
    await setupApp(createApp({}))

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('leaves the website\'s theme alone for the content script', async () => {
    await setupApp(createApp({}), { theme: false })

    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
