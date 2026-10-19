import type { BookmarkNodeRow } from '../model'
import type { NativeCreateDetails } from '../nativeAdapter'
import type { BookmarkIdBinding, PendingBrowserOperation } from '../storage'
import { describe, expect, it, vi } from 'vitest'
import { createFakeBrowser } from '~/tests/webextensionMock'

import { diffForests } from '../model'
import { applyDiff, recoverJournal } from '../nativeAdapter'
import { chromiumTree, FakeNativeApi, findInTree, row } from './nativeAdapterFixtures'

// nativeAdapter.ts -> storage.ts auto-imports the real `webextension-polyfill`,
// which throws outside an extension context.
vi.mock('webextension-polyfill', () => {
  const fake = createFakeBrowser()
  return { default: fake, ...fake }
})

const rootBinding: BookmarkIdBinding = { haexId: 'root-toolbar', browserId: '1', bindingType: 'root' }
const root = row({ id: 'root-toolbar', kind: 'folder', rootKind: 'toolbar', position: 0 })

function bookmark(id: string, position: number): BookmarkNodeRow {
  return row({ id, parentId: 'root-toolbar', title: id, url: `https://${id}.example`, position })
}

/** A journal that keeps what the sync pass would have saved to storage. */
function persistingJournal(bindings: BookmarkIdBinding[]) {
  const saved = { bindings, pending: [] as PendingBrowserOperation[] }
  return {
    saved,
    appendPending: async (op: PendingBrowserOperation) => {
      saved.pending.push(op)
    },
    resolvePending: async (opId: string, nextBindings?: BookmarkIdBinding[]) => {
      saved.pending = saved.pending.filter(op => op.opId !== opId)
      if (nextBindings)
        saved.bindings = nextBindings
    },
  }
}

async function toolbarUrls(api: FakeNativeApi) {
  return findInTree(await api.getTree(), '1')!.children!.map(c => c.url)
}

describe('an interrupted applyDiff', () => {
  it('is resumed from the saved bindings without duplicating finished creates', async () => {
    const api = new FakeNativeApi(chromiumTree())
    const journal = persistingJournal([rootBinding])
    const next = [root, bookmark('a', 1), bookmark('b', 2), bookmark('c', 3)]
    const create = api.create.bind(api)
    let calls = 0
    api.create = async (details: NativeCreateDetails) => {
      calls++
      if (calls === 3)
        throw new Error('worker stopped')
      return create(details)
    }

    await applyDiff(api, journal, journal.saved.bindings, diffForests([root], next)).catch(() => {})
    api.create = create
    await applyDiff(api, journal, journal.saved.bindings, diffForests([root], next))

    expect(await toolbarUrls(api)).toEqual(['https://example.com', 'https://a.example', 'https://b.example', 'https://c.example'])
  })

  it('does not create again what journal recovery already bound', async () => {
    const api = new FakeNativeApi(chromiumTree())
    const journal = persistingJournal([rootBinding])
    const beforeChildIds = findInTree(await api.getTree(), '1')!.children!.map(c => c.id)
    await api.create({ parentId: '1', title: 'a', url: 'https://a.example', index: 1, kind: 'bookmark' })
    const inFlight: PendingBrowserOperation = {
      opId: 'op1',
      type: 'create',
      haexId: 'a',
      browserId: null,
      parentBrowserId: '1',
      beforeChildIds,
      expected: { title: 'a', url: 'https://a.example', index: 1, kind: 'bookmark' },
    }

    const { bindings } = await recoverJournal(api, journal, [inFlight], [rootBinding])
    await applyDiff(api, journal, bindings, diffForests([root], [root, bookmark('a', 1)]))

    expect(await toolbarUrls(api)).toEqual(['https://example.com', 'https://a.example'])
  })

  it('journals the parent\'s children before each create', async () => {
    const api = new FakeNativeApi(chromiumTree())
    const appended: PendingBrowserOperation[] = []
    const journal = {
      appendPending: async (op: PendingBrowserOperation) => {
        appended.push(op)
      },
      resolvePending: async () => {},
    }

    await applyDiff(api, journal, [rootBinding], diffForests([root], [root, bookmark('a', 1)]))

    expect(appended[0].beforeChildIds).toEqual(['10'])
  })
})
