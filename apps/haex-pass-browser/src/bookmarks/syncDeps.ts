// Injected WebExtension/vault/storage surface of the bookmark sync service
// (see the `SyncServiceDeps` note in syncService.ts).

import type { BookmarkNodeRow } from './model'
import type { NativeBookmarkNode, NativeBookmarksApi } from './nativeAdapter'
import type { BookmarkSyncState, LoadResult } from './storage'
import type { BookmarkCollectionSummary, DeviceUpsertPayload } from './vaultClient'

export interface BookmarkEvents {
  onCreated: (cb: (id: string, node: NativeBookmarkNode) => void) => void
  onChanged: (cb: (id: string, changes: { title?: string, url?: string }) => void) => void
  onMoved: (cb: (id: string, info: { parentId: string, index: number }) => void) => void
  onRemoved: (cb: (id: string, info: { parentId: string, node: NativeBookmarkNode }) => void) => void
  onPermissionRemoved: (cb: (permissions: { permissions?: string[] }) => void) => void
}

export interface AlarmsApi {
  create: (name: string, info: { periodInMinutes: number }) => void
  clear: (name: string) => Promise<boolean>
  onAlarm: (cb: (alarm: { name: string }) => void) => void
}

export interface VaultClientDeps {
  listCollections: () => Promise<BookmarkCollectionSummary[]>
  createCollection: (name: string) => Promise<string>
  listNodes: (collectionId: string) => Promise<BookmarkNodeRow[]>
  upsertNodes: (collectionId: string, nodes: BookmarkNodeRow[]) => Promise<number>
  deleteNodes: (collectionId: string, ids: string[]) => Promise<number>
  upsertDevice: (payload: DeviceUpsertPayload) => Promise<void>
}

export interface StorageDeps {
  loadState: () => Promise<LoadResult>
  saveState: (state: BookmarkSyncState) => Promise<void>
}

export interface SyncServiceDeps {
  api: NativeBookmarksApi
  events: BookmarkEvents
  alarms: AlarmsApi
  storage: StorageDeps
  vault: VaultClientDeps
  now: () => string
  coalesceMs?: number
}
