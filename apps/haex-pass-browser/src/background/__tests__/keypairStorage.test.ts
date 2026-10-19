// `createFakeBrowser` must be imported before `webextension-polyfill`; see
// bookmarks/__tests__/storage.test.ts.
/* eslint-disable perfectionist/sort-imports */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeBrowser } from '~/tests/webextensionMock'
import browser from 'webextension-polyfill'
import type { KeypairStore } from '../keypairStorage'
import { arrayBufferToBase64, exportPublicKey } from '../crypto'
import { loadKeypair, saveAndVerifyKeypair } from '../keypairStorage'
/* eslint-enable perfectionist/sort-imports */

vi.mock('webextension-polyfill', () => {
  const fake = createFakeBrowser()
  return { default: fake, ...fake }
})

const fake = browser as unknown as ReturnType<typeof createFakeBrowser>
const LEGACY_KEY = 'haex-pass-keypair'

function memoryStore(): KeypairStore & { record: unknown } {
  const store = {
    record: undefined as unknown,
    read: async () => store.record,
    write: async (keyPair: Parameters<KeypairStore['write']>[0]) => {
      store.record = { ...keyPair }
    },
  }
  return store
}

async function legacyEntry() {
  const pair = await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']) as CryptoKeyPair
  return {
    publicKey: await exportPublicKey(pair.publicKey),
    privateKey: arrayBufferToBase64(await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
  }
}

beforeEach(() => {
  fake.__store.clear()
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('keypairStorage', () => {
  it('moves a keypair from storage.local into the key store and deletes the old copy', async () => {
    const legacy = await legacyEntry()
    fake.__store.set(LEGACY_KEY, legacy)
    const store = memoryStore()

    const loaded = await loadKeypair(store)

    expect(loaded).not.toBeNull()
    expect(await exportPublicKey(loaded!.publicKey)).toBe(legacy.publicKey)
    expect(loaded!.privateKey.extractable).toBe(false)
    expect(fake.__store.has(LEGACY_KEY)).toBe(false)
    expect(store.record).toMatchObject({ publicKey: loaded!.publicKey, privateKey: loaded!.privateKey })
  })

  it('prefers the key store and leaves storage.local alone', async () => {
    const store = memoryStore()
    const pair = await crypto.subtle.generateKey({ name: 'X25519' }, false, ['deriveBits']) as CryptoKeyPair
    await saveAndVerifyKeypair(pair, store)

    const loaded = await loadKeypair(store)

    expect(loaded?.privateKey).toBe(pair.privateKey)
    expect(fake.storage.local.get).not.toHaveBeenCalledWith(LEGACY_KEY)
  })

  it('returns null when neither place holds a keypair', async () => {
    expect(await loadKeypair(memoryStore())).toBeNull()
  })

  it('drops an unusable storage.local entry', async () => {
    fake.__store.set(LEGACY_KEY, { publicKey: 'AAAA', privateKey: 'AAAA' })

    expect(await loadKeypair(memoryStore())).toBeNull()
    expect(fake.__store.has(LEGACY_KEY)).toBe(false)
  })
})
