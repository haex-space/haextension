// Real WebExtension-backed implementations of the interfaces nativeAdapter.ts
// and syncService.ts declare as injectable. Kept separate from both so
// neither needs a `browser` import — this is the only file in `bookmarks/`
// that touches the global directly (besides vaultClient.ts's connection use).

import type { BrowserFamily } from './model'
import type { NativeBookmarkNode, NativeBookmarksApi, NativeCreateDetails } from './nativeAdapter'
import type { AlarmsApi, BookmarkEvents } from './syncService'

/** Feature-detects the current browser family (Firefox's `getBrowserInfo`, else UA sniffing). */
export async function detectBrowserFamily(): Promise<BrowserFamily> {
  const getBrowserInfo = (browser.runtime as unknown as { getBrowserInfo?: () => Promise<{ name: string }> }).getBrowserInfo
  if (typeof getBrowserInfo === 'function') {
    try {
      const info = await getBrowserInfo()
      if (/firefox/i.test(info.name))
        return 'firefox'
    } catch {
      // fall through to UA sniffing
    }
  }
  const ua = navigator.userAgent
  if (/firefox/i.test(ua))
    return 'firefox'
  if (/edg\//i.test(ua))
    return 'edge'
  if (/chrome|chromium/i.test(ua))
    return 'chromium'
  return 'other'
}

export function createRealNativeBookmarksApi(browserFamily: BrowserFamily): NativeBookmarksApi {
  return {
    supportsSeparators: browserFamily === 'firefox',

    async getTree() {
      const tree = await browser.bookmarks.getTree()
      return tree as unknown as NativeBookmarkNode[]
    },

    async create(details: NativeCreateDetails) {
      const createDetails: Record<string, unknown> = {
        parentId: details.parentId,
        title: details.title,
        index: details.index,
      }
      if (details.kind === 'bookmark')
        createDetails.url = details.url
      // `type` is a Firefox-only extension to bookmarks.create (needed to
      // materialize separators); Chromium ignores/rejects it.
      if (browserFamily === 'firefox')
        createDetails.type = details.kind
      const created = await browser.bookmarks.create(createDetails as Parameters<typeof browser.bookmarks.create>[0])
      return created as unknown as NativeBookmarkNode
    },

    async update(id, changes) {
      await browser.bookmarks.update(id, changes)
    },

    async move(id, destination) {
      await browser.bookmarks.move(id, destination)
    },

    async removeTree(id) {
      try {
        await browser.bookmarks.removeTree(id)
      } catch {
        // Already gone (e.g. re-running after a crash) — idempotent by contract.
      }
    },
  }
}

export function createRealBookmarkEvents(): BookmarkEvents {
  return {
    onCreated: cb => browser.bookmarks.onCreated.addListener((id, node) => cb(id, node as unknown as NativeBookmarkNode)),
    onChanged: cb => browser.bookmarks.onChanged.addListener((id, changes) => cb(id, changes)),
    onMoved: cb => browser.bookmarks.onMoved.addListener((id, info) => cb(id, { parentId: info.parentId, index: info.index })),
    onRemoved: cb => browser.bookmarks.onRemoved.addListener((id, info) =>
      cb(id, { parentId: info.parentId, node: info.node as unknown as NativeBookmarkNode })),
    onPermissionRemoved: cb => browser.permissions.onRemoved.addListener(cb),
  }
}

export function createRealAlarmsApi(): AlarmsApi {
  return {
    create: (name, info) => browser.alarms.create(name, info),
    clear: name => browser.alarms.clear(name),
    onAlarm: cb => browser.alarms.onAlarm.addListener(cb),
  }
}
