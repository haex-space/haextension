import { describe, expect, it, vi } from 'vitest'
import { createFakeBrowser } from '~/tests/webextensionMock'

import { createDevice, FakeVault, storageState } from './syncServiceFixtures'

// syncService.ts -> nativeAdapter.ts -> storage.ts auto-imports the real
// `webextension-polyfill`, which throws outside an extension context.
vi.mock('webextension-polyfill', () => {
  const fake = createFakeBrowser()
  return { default: fake, ...fake }
})

describe('switching collections', () => {
  it('switches Privat -> Arbeit -> Privat without mixing or loss', async () => {
    const vault = new FakeVault()
    const a = createDevice(vault, 100)
    await a.env.userCreate('1', 'PrivatBookmark', 'https://privat.example', 0)
    await a.service.completeOnboardingCreate({ name: 'Privat', replicaId: 'replica-a', browserFamily: 'chromium', deviceLabel: 'A' })
    const privatId = (storageState(a).settings as { collectionId: string }).collectionId
    await a.service.runSyncOnce()

    const arbeitId = await vault.createCollection('Arbeit')
    const switchToArbeit = await a.service.switchCollection({ collectionId: arbeitId, collectionName: 'Arbeit' })
    expect(switchToArbeit.ok).toBe(true)

    let tree = await a.env.getTree()
    let toolbar = tree[0].children!.find(c => c.id === '1')!
    expect(toolbar.children!.some(c => c.url === 'https://privat.example')).toBe(false)

    // Privat is untouched in the vault — switching away never deletes it.
    expect(vault.nodeCount(privatId)).toBeGreaterThan(0)

    const switchBack = await a.service.switchCollection({ collectionId: privatId, collectionName: 'Privat' })
    expect(switchBack.ok).toBe(true)
    tree = await a.env.getTree()
    toolbar = tree[0].children!.find(c => c.id === '1')!
    expect(toolbar.children!.some(c => c.url === 'https://privat.example')).toBe(true)
  })

  it('never produces a vault delete/tombstone for the collection being left', async () => {
    const vault = new FakeVault()
    const a = createDevice(vault, 100)
    await a.env.userCreate('1', 'PrivatBookmark', 'https://privat.example', 0)
    await a.service.completeOnboardingCreate({ name: 'Privat', replicaId: 'replica-a', browserFamily: 'chromium', deviceLabel: 'A' })
    const privatId = (storageState(a).settings as { collectionId: string }).collectionId
    await a.service.runSyncOnce()
    const countBefore = vault.nodeCount(privatId)

    const deleteSpy = vi.spyOn(vault, 'deleteNodes')
    const arbeitId = await vault.createCollection('Arbeit')
    await a.service.switchCollection({ collectionId: arbeitId, collectionName: 'Arbeit' })

    expect(deleteSpy).not.toHaveBeenCalled()
    expect(vault.nodeCount(privatId)).toBe(countBefore)
  })

  it('blocks the switch when dirty and the vault is unreachable, without emptying anything', async () => {
    const vault = new FakeVault()
    const a = createDevice(vault, 100)
    await a.service.completeOnboardingCreate({ name: 'Privat', replicaId: 'replica-a', browserFamily: 'chromium', deviceLabel: 'A' })
    await a.service.runSyncOnce()

    // Use the low-level `create` (no event emission) plus a direct state
    // patch to deterministically simulate "dirty, unsynced" — going through
    // the real event pipeline here would race the 2s/0ms coalesced
    // background sync against this test's own assertions.
    const created = await a.env.create({ parentId: '1', title: 'Unsynced', url: 'https://unsynced.example', index: 0, kind: 'bookmark' })
    const state = storageState(a)
    if (state.settings.mode === 'active') {
      state.settings.dirty = true
      state.pendingUpserts.push({
        id: 'haex-unsynced',
        collectionId: state.settings.collectionId,
        parentId: null,
        rootKind: null,
        kind: 'bookmark',
        title: 'Unsynced',
        url: 'https://unsynced.example',
        position: 0,
      })
    }

    // Simulate the vault being unreachable for the flush attempt.
    const originalUpsert = vault.upsertNodes
    vault.upsertNodes = async () => Promise.reject(new Error('offline'))

    const arbeitId = await vault.createCollection('Arbeit')
    const result = await a.service.switchCollection({ collectionId: arbeitId, collectionName: 'Arbeit' })
    expect(result.ok).toBe(false)

    const tree = await a.env.getTree()
    const toolbar = tree[0].children!.find(c => c.id === '1')!
    expect(toolbar.children!.some(c => c.id === created.id)).toBe(true)

    vault.upsertNodes = originalUpsert
  })

  it('keeps two collections fully independent — a device never sees the other collections nodes', async () => {
    const vault = new FakeVault()
    const a = createDevice(vault, 100)
    await a.env.userCreate('1', 'Priv', 'https://priv.example', 0)
    await a.service.completeOnboardingCreate({ name: 'Privat', replicaId: 'replica-a', browserFamily: 'chromium', deviceLabel: 'A' })
    await a.service.runSyncOnce()

    const c = createDevice(vault, 300)
    await c.env.userCreate('1', 'Work', 'https://work.example', 0)
    const workResult = await c.service.completeOnboardingCreate({ name: 'Arbeit', replicaId: 'replica-c', browserFamily: 'chromium', deviceLabel: 'C' })
    expect(workResult.success).toBe(true)

    await a.service.runSyncOnce()
    const aTree = await a.env.getTree()
    const aToolbar = aTree[0].children!.find(x => x.id === '1')!
    expect(aToolbar.children!.some(x => x.url === 'https://work.example')).toBe(false)
  })
})
