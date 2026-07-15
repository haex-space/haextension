import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const configSource = readFileSync(
  fileURLToPath(new URL('./nuxt.config.ts', import.meta.url)),
  'utf-8',
)

describe('i18n routing config', () => {
  it('does not use a route-prefix strategy that would override the vault-driven locale', () => {
    // With a prefix strategy (e.g. "prefix_and_default"), navigating to an
    // unprefixed route like /settings makes nuxt-i18n switch the active
    // locale to defaultLocale, overriding the locale set from the vault
    // context in stores/haexvault.ts.
    const match = configSource.match(/i18n:\s*{[\s\S]*?strategy:\s*"([^"]+)"/)
    expect(match?.[1]).toBe('no_prefix')
  })
})
