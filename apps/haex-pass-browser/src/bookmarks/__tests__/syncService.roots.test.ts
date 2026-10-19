import { describe, expect, it, vi } from 'vitest'
import { createFakeBrowser } from '~/tests/webextensionMock'

import { createDevice, FakeVault } from './syncServiceFixtures'

// syncService.ts -> nativeAdapter.ts -> storage.ts auto-imports the real
// `webextension-polyfill`, which throws outside an extension context.
vi.mock('webextension-polyfill', () => {
  const fake = createFakeBrowser()
  return { default: fake, ...fake }
})

function activate(device: ReturnType<typeof createDevice>, collectionId: string, label: string) {
  return device.service.completeOnboardingActivate({ collectionId, collectionName: 'Leer', replicaId: `replica-${label}`, browserFamily: 'chromium', deviceLabel: label })
}

async function toolbarUrls(device: ReturnType<typeof createDevice>) {
  const tree = await device.env.getTree()
  return tree[0].children!.find(c => c.id === '1')!.children!.map(c => c.url)
}

describe('a bookmark under a native root the collection has no row for', () => {
  it('reaches devices that are already syncing and devices that join later', async () => {
    const vault = new FakeVault()
    const collectionId = await vault.createCollection('Leer')
    const a = createDevice(vault, 100)
    const b = createDevice(vault, 200)
    await activate(a, collectionId, 'a')
    await activate(b, collectionId, 'b')

    await a.env.userCreate('1', 'In toolbar', 'https://toolbar.example', 0)
    await a.service.runSyncOnce()
    await b.service.runSyncOnce()

    expect(await toolbarUrls(b)).toContain('https://toolbar.example')

    const c = createDevice(vault, 300)
    await activate(c, collectionId, 'c')
    expect(await toolbarUrls(c)).toContain('https://toolbar.example')
  })

  it('follows a bookmark moved into such a root', async () => {
    const vault = new FakeVault()
    const collectionId = await vault.createCollection('Leer')
    const a = createDevice(vault, 100)
    const b = createDevice(vault, 200)
    await activate(a, collectionId, 'a')
    await activate(b, collectionId, 'b')
    const nativeId = await a.env.userCreate('1', 'Moving', 'https://moving.example', 0)
    await a.service.runSyncOnce()

    await a.env.userMove(nativeId, { parentId: '2', index: 0 })
    await a.service.runSyncOnce()
    await b.service.runSyncOnce()

    const otherRoot = (await b.env.getTree())[0].children!.find(c => c.id === '2')!
    expect(otherRoot.children!.map(c => c.url)).toContain('https://moving.example')
  })
})
