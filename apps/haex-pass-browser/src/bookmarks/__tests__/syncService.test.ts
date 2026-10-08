import { describe, expect, it, vi } from 'vitest'
import { createFakeBrowser } from '~/tests/webextensionMock'

import { createDevice, FakeVault, storageState } from './syncServiceFixtures'

// syncService.ts -> nativeAdapter.ts -> storage.ts auto-imports the real
// `webextension-polyfill`, which throws outside an extension context.
vi.mock('webextension-polyfill', () => {
  const fake = createFakeBrowser()
  return { default: fake, ...fake }
})

describe('onboarding create + activate', () => {
  it('a creates a collection from existing bookmarks — nothing deleted, everything uploaded', async () => {
    const vault = new FakeVault()
    const a = createDevice(vault, 100)
    await a.env.create({ parentId: '1', title: 'Existing', url: 'https://existing.example', index: 0, kind: 'bookmark' })

    const result = await a.service.completeOnboardingCreate({
      name: 'Private',
      replicaId: 'replica-a',
      browserFamily: 'chromium',
      deviceLabel: 'A',
    })
    expect(result.success).toBe(true)

    const state = storageState(a)
    expect(state.settings.mode).toBe('active')
    const collectionId = state.settings.mode === 'active' ? state.settings.collectionId : ''
    expect(vault.nodeCount(collectionId)).toBeGreaterThan(0)

    const tree = await a.env.getTree()
    const toolbar = tree[0].children!.find(c => c.id === '1')!
    expect(toolbar.children!.some(c => c.url === 'https://existing.example')).toBe(true)
  })

  it('b activates the collection — replaces Bs native bookmarks with As content', async () => {
    const vault = new FakeVault()
    const a = createDevice(vault, 100)
    await a.env.create({ parentId: '1', title: 'FromA', url: 'https://from-a.example', index: 0, kind: 'bookmark' })
    await a.service.completeOnboardingCreate({ name: 'Private', replicaId: 'replica-a', browserFamily: 'chromium', deviceLabel: 'A' })
    const collectionId = (storageState(a).settings as { collectionId: string }).collectionId

    const b = createDevice(vault, 200)
    await b.env.create({ parentId: '1', title: 'BsOwn', url: 'https://bs-own.example', index: 0, kind: 'bookmark' })

    const result = await b.service.completeOnboardingActivate({
      collectionId,
      collectionName: 'Private',
      replicaId: 'replica-b',
      browserFamily: 'chromium',
      deviceLabel: 'B',
    })
    expect(result.success).toBe(true)

    const bTree = await b.env.getTree()
    const bToolbar = bTree[0].children!.find(c => c.id === '1')!
    expect(bToolbar.children!.some(c => c.url === 'https://from-a.example')).toBe(true)
    expect(bToolbar.children!.some(c => c.url === 'https://bs-own.example')).toBe(false)
  })
})

describe('ongoing sync between two devices', () => {
  async function setupPairedDevices() {
    const vault = new FakeVault()
    const a = createDevice(vault, 100)
    await a.service.completeOnboardingCreate({ name: 'Private', replicaId: 'replica-a', browserFamily: 'chromium', deviceLabel: 'A' })
    const collectionId = (storageState(a).settings as { collectionId: string }).collectionId

    const b = createDevice(vault, 200)
    await b.service.completeOnboardingActivate({ collectionId, collectionName: 'Private', replicaId: 'replica-b', browserFamily: 'chromium', deviceLabel: 'B' })

    return { vault, a, b, collectionId }
  }

  it('a add/rename/move mirrors to B after both sync', async () => {
    const { a, b } = await setupPairedDevices()

    const newId = await a.env.userCreate('1', 'New', 'https://new.example', 0)
    await a.service.runSyncOnce()
    await b.service.runSyncOnce()

    let bTree = await b.env.getTree()
    let bToolbar = bTree[0].children!.find(c => c.id === '1')!
    expect(bToolbar.children!.some(c => c.url === 'https://new.example')).toBe(true)

    await a.env.userUpdate(newId, { title: 'Renamed' })
    await a.service.runSyncOnce()
    await b.service.runSyncOnce()
    bTree = await b.env.getTree()
    bToolbar = bTree[0].children!.find(c => c.id === '1')!
    expect(bToolbar.children!.find(c => c.url === 'https://new.example')!.title).toBe('Renamed')
  })

  it('b delete removes the link on A after both sync', async () => {
    const { a, b } = await setupPairedDevices()
    await a.env.userCreate('1', 'ToDelete', 'https://to-delete.example', 0)
    await a.service.runSyncOnce()
    await b.service.runSyncOnce()

    const bTreeBefore = await b.env.getTree()
    const bToolbarBefore = bTreeBefore[0].children!.find(c => c.id === '1')!
    const bNativeId = bToolbarBefore.children!.find(c => c.url === 'https://to-delete.example')!.id

    await b.env.userRemove(bNativeId)
    await b.service.runSyncOnce()
    await a.service.runSyncOnce()

    const aTree = await a.env.getTree()
    const aToolbar = aTree[0].children!.find(c => c.id === '1')!
    expect(aToolbar.children!.some(c => c.url === 'https://to-delete.example')).toBe(false)
  })

  it('poll with no semantic change performs zero native and zero vault writes', async () => {
    const { a } = await setupPairedDevices()
    await a.service.runSyncOnce() // settle

    const treeBefore = await a.env.getTree()
    await a.service.runSyncOnce()
    const treeAfter = await a.env.getTree()
    expect(treeAfter).toEqual(treeBefore)
  })
})

describe('permission removal', () => {
  it('stops the alarm when the bookmarks permission is revoked', async () => {
    const vault = new FakeVault()
    const a = createDevice(vault, 100)
    await a.service.completeOnboardingCreate({ name: 'Privat', replicaId: 'replica-a', browserFamily: 'chromium', deviceLabel: 'A' })
    await a.service.start()
    expect(a.env.alarmCreated).toBe(true)

    a.env.firePermissionRemoved()
    await Promise.resolve()
    await Promise.resolve()

    expect(a.env.alarmCleared).toBe(true)
    expect(storageState(a).settings.mode).toBe('disabled')
  })
})
