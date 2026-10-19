import { describe, expect, it, vi } from 'vitest'
import { createFakeBrowser } from '~/tests/webextensionMock'

import { createDevice, FakeVault, storageState } from './syncServiceFixtures'

// syncService.ts -> nativeAdapter.ts -> storage.ts auto-imports the real
// `webextension-polyfill`, which throws outside an extension context.
vi.mock('webextension-polyfill', () => {
  const fake = createFakeBrowser()
  return { default: fake, ...fake }
})

async function activeDevice() {
  const vault = new FakeVault()
  const a = createDevice(vault, 100)
  await a.service.completeOnboardingCreate({ name: 'Privat', replicaId: 'replica-a', browserFamily: 'chromium', deviceLabel: 'A' })
  const collectionId = (storageState(a).settings as { collectionId: string }).collectionId
  await a.service.runSyncOnce()
  return { vault, a, collectionId }
}

async function vaultUrls(vault: FakeVault, collectionId: string) {
  return (await vault.listNodes(collectionId)).map(node => node.url)
}

describe('state changes during a sync pass', () => {
  it('keeps a bookmark the user creates while a pass waits for the vault', async () => {
    const { vault, a, collectionId } = await activeDevice()
    const listNodes = vault.listNodes
    vault.listNodes = async (id) => {
      vault.listNodes = listNodes
      await a.env.userCreate('1', 'During', 'https://during.example', 0)
      return listNodes(id)
    }

    await a.service.runSyncOnce()
    await a.service.runSyncOnce()

    expect(await vaultUrls(vault, collectionId)).toContain('https://during.example')
  })

  it('records a folder and a bookmark created in it right after each other', async () => {
    const { vault, a, collectionId } = await activeDevice()

    const nativeFolder = await a.env.create({ parentId: '1', title: 'Folder', index: 0, kind: 'folder' })
    const nativeChild = await a.env.create({ parentId: nativeFolder.id, title: 'Child', url: 'https://child.example', index: 0, kind: 'bookmark' })
    a.env.emitCreated(nativeFolder.id)
    a.env.emitCreated(nativeChild.id)
    await a.service.runSyncOnce()

    const nodes = await vault.listNodes(collectionId)
    const folder = nodes.find(node => node.title === 'Folder')
    const child = nodes.find(node => node.url === 'https://child.example')
    expect(folder).toBeDefined()
    expect(child?.parentId).toBe(folder?.id)
  })

  it('does not revert a disable that lands during a pass', async () => {
    const { vault, a } = await activeDevice()
    await a.env.userCreate('1', 'Pending', 'https://pending.example', 0)
    const listNodes = vault.listNodes
    let disabled: Promise<void> | null = null
    vault.listNodes = async (id) => {
      vault.listNodes = listNodes
      disabled = a.service.disableSync()
      return listNodes(id)
    }

    await a.service.runSyncOnce()
    await disabled

    expect(storageState(a).settings.mode).toBe('disabled')
  })
})
