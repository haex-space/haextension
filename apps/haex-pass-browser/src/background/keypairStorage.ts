import type { KeyPair } from './crypto'
import { exportPublicKey, importPrivateKey, importPublicKey } from './crypto'

// The client keypair lives in the extension origin's IndexedDB as
// non-extractable CryptoKeys. `storage.local`, where it used to be kept as
// PKCS#8, is readable by every content script, i.e. from each website's
// renderer, and the vault grants this key lasting access to all passwords.
const DB_NAME = 'haex-pass'
const DB_VERSION = 1
const STORE_NAME = 'keys'
const RECORD_KEY = 'client-keypair'

const LEGACY_STORAGE_KEY = 'haex-pass-keypair'

export interface KeypairStore {
  read: () => Promise<unknown>
  write: (keyPair: KeyPair) => Promise<void>
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function runInStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode)
      const request = run(transaction.objectStore(STORE_NAME))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}

const indexedDbStore: KeypairStore = {
  read: () => runInStore('readonly', store => store.get(RECORD_KEY)),
  write: async (keyPair) => {
    await runInStore('readwrite', store => store.put({ publicKey: keyPair.publicKey, privateKey: keyPair.privateKey }, RECORD_KEY))
  },
}

function isKeyPair(value: unknown): value is KeyPair {
  const candidate = value as Partial<KeyPair> | null | undefined
  return candidate?.publicKey instanceof CryptoKey && candidate.privateKey instanceof CryptoKey
}

/** Reads the PKCS#8 copy older versions kept in storage.local; an unusable one is deleted. */
async function loadLegacyKeypair(): Promise<KeyPair | null> {
  const result = await browser.storage.local.get(LEGACY_STORAGE_KEY)
  const stored = result[LEGACY_STORAGE_KEY] as { publicKey?: unknown, privateKey?: unknown } | undefined
  if (!stored)
    return null

  try {
    if (typeof stored.publicKey !== 'string' || typeof stored.privateKey !== 'string')
      throw new Error('incomplete entry')
    return {
      publicKey: await importPublicKey(stored.publicKey),
      privateKey: await importPrivateKey(stored.privateKey),
    }
  } catch (err) {
    console.error('[haex-pass] Stored keypair is unusable, clearing:', err)
    await browser.storage.local.remove(LEGACY_STORAGE_KEY)
    return null
  }
}

export async function loadKeypair(store: KeypairStore = indexedDbStore): Promise<KeyPair | null> {
  const stored = await store.read()
  if (isKeyPair(stored))
    return stored

  const legacy = await loadLegacyKeypair()
  if (!legacy)
    return null
  // Same keypair, so the clientId and the vault's authorization carry over.
  await saveAndVerifyKeypair(legacy, store)
  await browser.storage.local.remove(LEGACY_STORAGE_KEY)
  return legacy
}

export async function saveAndVerifyKeypair(keyPair: KeyPair, store: KeypairStore = indexedDbStore): Promise<void> {
  await store.write(keyPair)

  // Round-trip check, so a store that silently drops the keys aborts init
  // instead of minting a new clientId on every service-worker restart.
  const reloaded = await store.read()
  if (!isKeyPair(reloaded))
    throw new Error('keypair save verification failed — the key store does not return what we wrote')
  if (await exportPublicKey(reloaded.publicKey) !== await exportPublicKey(keyPair.publicKey))
    throw new Error('keypair save verification failed — the stored public key differs from the saved one')
}
