import type { BookmarkNodeRow } from '../model'
import type { BookmarkIdBinding } from '../storage'
import { describe, expect, it, vi } from 'vitest'
import { createFakeBrowser } from '~/tests/webextensionMock'

import { diffForests } from '../model'
import { activateCollection, applyDiff } from '../nativeAdapter'
import { chromiumTree, createFakeJournal, FakeNativeApi, findInTree, row } from './nativeAdapterFixtures'

// nativeAdapter.ts -> storage.ts auto-imports the real `webextension-polyfill`,
// which throws outside an extension context.
vi.mock('webextension-polyfill', () => {
  const fake = createFakeBrowser()
  return { default: fake, ...fake }
})

describe('positions past the current child count', () => {
  it('materializes the siblings that follow a skipped separator', async () => {
    const api = new FakeNativeApi(chromiumTree(), { supportsSeparators: false })
    const target: BookmarkNodeRow[] = [
      row({ id: 'root-toolbar', kind: 'folder', rootKind: 'toolbar', position: 0 }),
      row({ id: 'a', parentId: 'root-toolbar', title: 'A', url: 'https://a.example', position: 0 }),
      row({ id: 'sep', parentId: 'root-toolbar', kind: 'separator', position: 1 }),
      row({ id: 'b', parentId: 'root-toolbar', title: 'B', url: 'https://b.example', position: 2 }),
    ]

    await activateCollection(api, createFakeJournal(), 'chromium', target)

    const toolbar = findInTree(await api.getTree(), '1')!
    expect(toolbar.children!.map(c => c.url)).toEqual(['https://a.example', 'https://b.example'])
  })

  it('appends creates and moves whose position lies past the end', async () => {
    const api = new FakeNativeApi(chromiumTree())
    const bindings: BookmarkIdBinding[] = [{ haexId: 'root-toolbar', browserId: '1', bindingType: 'root' }]
    const root = row({ id: 'root-toolbar', kind: 'folder', rootKind: 'toolbar', position: 0 })
    const created = row({ id: 'bm1', parentId: 'root-toolbar', title: 'Gap', url: 'https://gap.example', position: 5 })

    const { bindings: afterCreate } = await applyDiff(api, createFakeJournal(), bindings, diffForests([root], [root, created]))
    const moved = { ...created, position: 9 }
    await applyDiff(api, createFakeJournal(), afterCreate, diffForests([root, created], [root, moved]))

    const toolbar = findInTree(await api.getTree(), '1')!
    expect(toolbar.children!.at(-1)?.url).toBe('https://gap.example')
  })
})
