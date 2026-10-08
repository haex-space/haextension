import type { KeyPair } from './crypto'
import { exportPrivateKey, exportPublicKey, importPrivateKey, importPublicKey } from './crypto'

const STORAGE_KEY_KEYPAIR = 'haex-pass-keypair'

export async function loadKeypair(): Promise<KeyPair | null> {
  let stored: { publicKey?: string, privateKey?: string } | undefined
  try {
    const result = await browser.storage.local.get(STORAGE_KEY_KEYPAIR)
    stored = result[STORAGE_KEY_KEYPAIR] as { publicKey?: string, privateKey?: string } | undefined
  } catch (err) {
    console.error('[haex-pass] storage.local.get failed:', err)
    return null
  }

  if (!stored) {
    console.log('[haex-pass] storage.local has no keypair entry')
    return null
  }
  if (!stored.publicKey || !stored.privateKey) {
    console.warn('[haex-pass] storage.local entry is incomplete:', { hasPub: !!stored.publicKey, hasPriv: !!stored.privateKey })
    return null
  }

  try {
    const publicKey = await importPublicKey(stored.publicKey)
    const privateKey = await importPrivateKey(stored.privateKey)
    return { publicKey, privateKey }
  } catch (err) {
    // Stored bytes are unusable (format change, corruption). Drop them so
    // the caller generates and persists a fresh keypair instead of looping.
    console.error('[haex-pass] Stored keypair is unusable, clearing:', err)
    try {
      await browser.storage.local.remove(STORAGE_KEY_KEYPAIR)
    } catch (removeErr) {
      console.error('[haex-pass] storage.local.remove failed:', removeErr)
    }
    return null
  }
}

export async function saveAndVerifyKeypair(keyPair: KeyPair): Promise<void> {
  const publicKey = await exportPublicKey(keyPair.publicKey)
  const privateKey = await exportPrivateKey(keyPair.privateKey)
  await browser.storage.local.set({
    [STORAGE_KEY_KEYPAIR]: { publicKey, privateKey },
  })

  // Full round-trip check: re-read from storage AND re-import as CryptoKeys.
  // String-equality on the base64 alone wouldn't catch an export/import
  // mismatch that would later make loadKeypair() return null on every
  // service-worker restart.
  const reloaded = await loadKeypair()
  if (!reloaded) {
    throw new Error('keypair save verification failed — storage.local does not return what we wrote')
  }
  const reloadedPublic = await exportPublicKey(reloaded.publicKey)
  if (reloadedPublic !== publicKey) {
    throw new Error('keypair save verification failed — re-imported public key differs from saved one')
  }
}
