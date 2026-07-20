// This import order is deliberate, not alphabetical: `createFakeBrowser`
// must be imported before `webextension-polyfill` — the mock factory below
// references it, and module init runs in import-declaration order (the
// textual position of `vi.mock` itself doesn't matter).
/* eslint-disable perfectionist/sort-imports */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeBrowser } from '~/tests/webextensionMock'
import browser from 'webextension-polyfill'
import {
  addBinding,
  BindingConflictError,
  buildBindingMaps,
  defaultDisabledState,
  loadState,
  saveState,
} from '../storage'
/* eslint-enable perfectionist/sort-imports */

vi.mock('webextension-polyfill', () => {
  const fake = createFakeBrowser()
  return { default: fake, ...fake }
})

const fake = browser as unknown as ReturnType<typeof createFakeBrowser>

beforeEach(() => {
  fake.__store.clear()
  vi.clearAllMocks()
})

describe('loadState', () => {
  it('returns the disabled default when nothing is stored yet', async () => {
    const result = await loadState()
    expect(result).toEqual({ ok: true, state: defaultDisabledState() })
  })

  it('round-trips a saved active state', async () => {
    const state = {
      ...defaultDisabledState(),
      settings: {
        schemaVersion: 1 as const,
        mode: 'active' as const,
        collectionId: 'c1',
        collectionName: 'Private',
        replicaId: 'r1',
        browserFamily: 'firefox' as const,
        deviceLabel: 'Firefox · Linux · r1abcd',
        dirty: false,
        lastSyncAt: null,
        lastError: null,
      },
    }
    await saveState(state)
    const result = await loadState()
    expect(result).toEqual({ ok: true, state })
  })

  it('reports a storage read failure as an error, not as a fresh default', async () => {
    fake.storage.local.get.mockRejectedValueOnce(new Error('boom'))
    const result = await loadState()
    expect(result.ok).toBe(false)
  })

  it('reports an unrecognized stored shape as an error instead of overwriting it', async () => {
    await fake.storage.local.set({ 'haex-pass-bookmark-sync-state': { garbage: true } })
    const result = await loadState()
    expect(result.ok).toBe(false)
  })
})

describe('saveState', () => {
  it('writes the whole object under a single key', async () => {
    const state = defaultDisabledState()
    await saveState(state)
    expect(fake.storage.local.set).toHaveBeenCalledWith({ 'haex-pass-bookmark-sync-state': state })
  })
})

describe('binding bijectivity', () => {
  it('adds a fresh binding', () => {
    const bindings = addBinding([], { haexId: 'h1', browserId: 'b1', bindingType: 'node' })
    expect(bindings).toEqual([{ haexId: 'h1', browserId: 'b1', bindingType: 'node' }])
  })

  it('is idempotent when re-adding the exact same pair', () => {
    const first = addBinding([], { haexId: 'h1', browserId: 'b1', bindingType: 'node' })
    const second = addBinding(first, { haexId: 'h1', browserId: 'b1', bindingType: 'node' })
    expect(second).toBe(first)
  })

  it('throws when a haexId is rebound to a different browserId', () => {
    const bindings = addBinding([], { haexId: 'h1', browserId: 'b1', bindingType: 'node' })
    expect(() => addBinding(bindings, { haexId: 'h1', browserId: 'b2', bindingType: 'node' }))
      .toThrow(BindingConflictError)
  })

  it('throws when a browserId is rebound to a different haexId', () => {
    const bindings = addBinding([], { haexId: 'h1', browserId: 'b1', bindingType: 'node' })
    expect(() => addBinding(bindings, { haexId: 'h2', browserId: 'b1', bindingType: 'node' }))
      .toThrow(BindingConflictError)
  })

  it('builds bijective lookup maps from a binding list', () => {
    const bindings = [
      { haexId: 'h1', browserId: 'b1', bindingType: 'node' as const },
      { haexId: 'h2', browserId: 'b2', bindingType: 'root' as const },
    ]
    const { haexToBrowser, browserToHaex } = buildBindingMaps(bindings)
    expect(haexToBrowser.get('h1')).toBe('b1')
    expect(browserToHaex.get('b2')).toBe('h2')
  })
})
