import type { NativeCreateDetails } from '../nativeAdapter'
import { describe, expect, it, vi } from 'vitest'
import { createFakeBrowser } from '~/tests/webextensionMock'

import { createDevice, FakeVault, storageState } from './syncServiceFixtures'

// syncService.ts -> nativeAdapter.ts -> storage.ts auto-imports the real
// `webextension-polyfill`, which throws outside an extension context.
vi.mock('webextension-polyfill', () => {
  const fake = createFakeBrowser()
  return { default: fake, ...fake }
})

async function pairedDevices() {
  const vault = new FakeVault()
  const a = createDevice(vault, 100)
  await a.service.completeOnboardingCreate({ name: 'Privat', replicaId: 'replica-a', browserFamily: 'chromium', deviceLabel: 'A' })
  const collectionId = (storageState(a).settings as { collectionId: string }).collectionId
  const b = createDevice(vault, 200)
  await b.service.completeOnboardingActivate({ collectionId, collectionName: 'Privat', replicaId: 'replica-b', browserFamily: 'chromium', deviceLabel: 'B' })
  return { vault, a, b, collectionId }
}

async function toolbarUrls(device: ReturnType<typeof createDevice>) {
  const tree = await device.env.getTree()
  return tree[0].children!.find(c => c.id === '1')!.children!.map(c => c.url)
}

describe('a remote change the browser refuses', () => {
  it('is reported and retried without blocking the rest of the sync', async () => {
    const { vault, a, b, collectionId } = await pairedDevices()
    await a.env.userCreate('1', 'Refused', 'https://refused.example', 0)
    await a.env.userCreate('1', 'Fine', 'https://fine.example', 1)
    await a.service.runSyncOnce()

    const create = b.env.create.bind(b.env)
    b.env.create = async (details: NativeCreateDetails) => {
      if (details.url === 'https://refused.example')
        throw new Error('Invalid URL')
      return create(details)
    }
    await b.env.userCreate('1', 'Local', 'https://local.example', 0)
    await expect(b.service.runSyncOnce()).resolves.toBeUndefined()

    expect(await toolbarUrls(b)).toContain('https://fine.example')
    expect(await toolbarUrls(b)).not.toContain('https://refused.example')
    expect((await vault.listNodes(collectionId)).map(n => n.url)).toContain('https://local.example')
    const failed = storageState(b)
    expect(failed.pendingOps).toEqual([])
    expect(failed.settings.mode === 'active' && failed.settings.lastError).toBeTruthy()

    b.env.create = create
    await b.service.runSyncOnce()

    expect(await toolbarUrls(b)).toContain('https://refused.example')
    const recovered = storageState(b)
    expect(recovered.settings.mode === 'active' && recovered.settings.lastError).toBeNull()
  })

  it('does not stop the pass when the device heartbeat fails', async () => {
    const { vault, a } = await pairedDevices()
    vault.upsertDevice = async () => {
      throw new Error('offline')
    }
    await a.env.userCreate('1', 'New', 'https://new.example', 0)

    await expect(a.service.runSyncOnce()).resolves.toBeUndefined()
    const { settings } = storageState(a)
    expect(settings.mode === 'active' && settings.dirty).toBe(false)
  })
})
