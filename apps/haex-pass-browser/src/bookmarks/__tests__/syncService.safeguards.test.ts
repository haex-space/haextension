import type { BookmarkNodeRow } from '../model'
import { describe, expect, it, vi } from 'vitest'
import { createFakeBrowser } from '~/tests/webextensionMock'

import { createDevice, FakeVault, storageState } from './syncServiceFixtures'

// syncService.ts -> nativeAdapter.ts -> storage.ts auto-imports the real
// `webextension-polyfill`, which throws outside an extension context.
vi.mock('webextension-polyfill', () => {
  const fake = createFakeBrowser()
  return { default: fake, ...fake }
})

describe('bulk-delete protection', () => {
  it('quarantines an incoming bulk delete before touching the native tree', async () => {
    const vault = new FakeVault()
    const a = createDevice(vault, 100)
    const rows: BookmarkNodeRow[] = [
      { id: 'root-toolbar', collectionId: '', parentId: null, rootKind: 'toolbar', kind: 'folder', title: null, url: null, position: 0 },
    ]
    for (let i = 0; i < 30; i++) {
      rows.push({ id: `n${i}`, collectionId: '', parentId: 'root-toolbar', rootKind: null, kind: 'bookmark', title: `B${i}`, url: `https://b${i}.example`, position: i })
    }
    const collectionId = await vault.createCollection('Privat')
    rows.forEach(r => (r.collectionId = collectionId))
    await vault.upsertNodes(collectionId, rows)

    await a.service.completeOnboardingActivate({ collectionId, collectionName: 'Privat', replicaId: 'replica-a', browserFamily: 'chromium', deviceLabel: 'A' })
    await a.service.runSyncOnce() // settle onto the full snapshot

    await vault.deleteNodes(collectionId, rows.slice(1).map(r => r.id)) // delete all 30 bookmarks at once

    const treeBefore = await a.env.getTree()
    await a.service.runSyncOnce()
    const treeAfter = await a.env.getTree()

    expect(treeAfter).toEqual(treeBefore) // apply was halted before touching native
    const state = storageState(a)
    expect(state.pendingDeletionReview).not.toBeNull()
    expect(state.pendingDeletionReview?.deletedHaexIds).toHaveLength(30)
  })

  async function setupQuarantinedBulkDelete() {
    const vault = new FakeVault()
    const a = createDevice(vault, 100)
    const rows: BookmarkNodeRow[] = [
      { id: 'root-toolbar', collectionId: '', parentId: null, rootKind: 'toolbar', kind: 'folder', title: null, url: null, position: 0 },
    ]
    for (let i = 0; i < 30; i++) {
      rows.push({ id: `n${i}`, collectionId: '', parentId: 'root-toolbar', rootKind: null, kind: 'bookmark', title: `B${i}`, url: `https://b${i}.example`, position: i })
    }
    const collectionId = await vault.createCollection('Privat')
    rows.forEach(r => (r.collectionId = collectionId))
    await vault.upsertNodes(collectionId, rows)

    await a.service.completeOnboardingActivate({ collectionId, collectionName: 'Privat', replicaId: 'replica-a', browserFamily: 'chromium', deviceLabel: 'A' })
    await a.service.runSyncOnce() // settle onto the full snapshot

    await vault.deleteNodes(collectionId, rows.slice(1).map(r => r.id)) // delete all 30 bookmarks at once
    await a.service.runSyncOnce() // quarantined

    return { vault, a, collectionId, rows }
  }

  it('confirming applies the quarantined diff instead of re-quarantining it forever', async () => {
    const { a } = await setupQuarantinedBulkDelete()

    await a.service.confirmPendingDeletions()
    await a.service.runSyncOnce()

    const state = storageState(a)
    expect(state.pendingDeletionReview).toBeNull()
    const tree = await a.env.getTree()
    const toolbar = tree[0].children!.find(c => c.id === '1')!
    expect(toolbar.children ?? []).toHaveLength(0) // the 30 bookmarks are now removed natively too

    // A further sync pass must not re-detect and re-quarantine the (now converged) state.
    await a.service.runSyncOnce()
    expect(storageState(a).pendingDeletionReview).toBeNull()
  })

  it('rejecting pushes the deleted nodes back to the vault and clears the review', async () => {
    const { vault, a, collectionId, rows } = await setupQuarantinedBulkDelete()
    const upsertSpy = vi.spyOn(vault, 'upsertNodes')

    await a.service.rejectPendingDeletions()

    expect(storageState(a).pendingDeletionReview).toBeNull()
    const [pushedCollectionId, pushedNodes] = upsertSpy.mock.calls.at(-1)!
    expect(pushedCollectionId).toBe(collectionId)
    expect(pushedNodes.map((n: BookmarkNodeRow) => n.id).sort()).toEqual(rows.slice(1).map(r => r.id).sort())
  })
})

describe('oWN_COLLECTION_MISSING', () => {
  it('flags ownCollectionMissing instead of auto-recreating when the collection disappears', async () => {
    const vault = new FakeVault()
    const a = createDevice(vault, 100)
    await a.env.userCreate('1', 'X', 'https://x.example', 0)
    await a.service.completeOnboardingCreate({ name: 'Privat', replicaId: 'replica-a', browserFamily: 'chromium', deviceLabel: 'A' })
    await a.service.runSyncOnce()

    // OWN_COLLECTION_MISSING specifically detects "the collection still
    // exists but returns zero rows even though our snapshot is non-empty" —
    // simulate that by repointing the active settings at a fresh, empty one.
    const emptyId = await vault.createCollection('EmptiedOut')
    ;(storageState(a).settings as { collectionId: string }).collectionId = emptyId

    await a.service.runSyncOnce()
    expect(storageState(a).ownCollectionMissing).toBe(true)
  })
})
