// Shared fake `webextension-polyfill` module for tests. Source files get
// `browser` via unplugin-auto-import (which resolves to the whole
// 'webextension-polyfill' module); tests mock that module id directly so the
// same fake instance is visible both to the code under test and to the
// spec's own assertions/setup.
//
// Usage in a spec file:
//
//   vi.mock('webextension-polyfill', () => {
//     const fake = createFakeBrowser()
//     return { default: fake, ...fake }
//   })
//   import browser from 'webextension-polyfill' // same instance as the mock
import { vi } from 'vitest'

export function createFakeBrowser() {
  const store = new Map<string, unknown>()

  return {
    __store: store,
    storage: {
      local: {
        get: vi.fn(async (keys?: string | string[] | Record<string, unknown>) => {
          if (keys === undefined || keys === null)
            return Object.fromEntries(store)
          const keyList = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys)
          const result: Record<string, unknown> = {}
          for (const key of keyList) {
            if (store.has(key))
              result[key] = store.get(key)
          }
          return result
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) store.set(key, value)
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          const keyList = typeof keys === 'string' ? [keys] : keys
          for (const key of keyList) store.delete(key)
        }),
      },
    },
    permissions: {
      request: vi.fn(async (_permissions?: { permissions?: string[] }) => true),
      contains: vi.fn(async (_permissions?: { permissions?: string[] }) => false),
      remove: vi.fn(async (_permissions?: { permissions?: string[] }) => true),
      onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: {
      sendMessage: vi.fn(async (_message?: unknown): Promise<unknown> => undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      onInstalled: { addListener: vi.fn(), removeListener: vi.fn() },
      getBrowserInfo: undefined as (() => Promise<{ name: string }>) | undefined,
    },
    bookmarks: {
      getTree: vi.fn(async () => []),
      create: vi.fn(),
      update: vi.fn(),
      move: vi.fn(),
      remove: vi.fn(),
      removeTree: vi.fn(),
      onCreated: { addListener: vi.fn(), removeListener: vi.fn() },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      onMoved: { addListener: vi.fn(), removeListener: vi.fn() },
      onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    alarms: {
      create: vi.fn(),
      clear: vi.fn(async () => true),
      onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  }
}

export type FakeBrowser = ReturnType<typeof createFakeBrowser>
