// Typed client for the six `bookmarks-*` bridge methods (see
// haex-vault plans/001-add-bookmarks-table-and-bridge.md for the contract).
// Thin wrappers over `vaultConnection.sendRequest`, in the same style as the
// existing password/passkey wrappers in `background/connection.ts`, plus
// defensive response validation. Never logs url/title/publicKey.

import type { BrowserFamily } from './model'
import { vaultConnection } from '~/background/connection'
import type { BookmarkNodeRow } from './model'

const REQUEST_TIMEOUT_MS = 30000

export const BOOKMARKS_METHODS = {
  COLLECTIONS_LIST: 'bookmarks-collections-list',
  COLLECTION_CREATE: 'bookmarks-collection-create',
  LIST: 'bookmarks-list',
  UPSERT: 'bookmarks-upsert',
  DELETE: 'bookmarks-delete',
  DEVICE_UPSERT: 'bookmarks-device-upsert',
} as const

export interface BookmarkCollectionSummary {
  id: string
  name: string
  updatedAt: string | null
  bookmarkCount: number
  deviceLabels: string[]
}

export interface DeviceUpsertPayload {
  collectionId: string
  replicaId: string
  deviceLabel: string
  browserFamily: BrowserFamily
}

export class VaultBridgeError extends Error {
  constructor(message: string, public readonly errorCode?: string) {
    super(message)
    this.name = 'VaultBridgeError'
  }
}

interface CoreResponse<T> {
  requestId?: string
  success?: boolean
  data?: T
  error?: string
  errorCode?: string
}

async function call<T>(action: string, payload: object): Promise<T> {
  const response = await vaultConnection.sendRequest<CoreResponse<T>>(action, payload, REQUEST_TIMEOUT_MS)
  if (!response || typeof response !== 'object') {
    throw new VaultBridgeError(`Malformed response for ${action}`)
  }
  if (!response.success) {
    throw new VaultBridgeError(response.error ?? `Request failed: ${action}`, response.errorCode)
  }
  if (response.data === undefined) {
    throw new VaultBridgeError(`Missing data for ${action}`)
  }
  return response.data
}

export async function listCollections(): Promise<BookmarkCollectionSummary[]> {
  const data = await call<{ collections: unknown }>(BOOKMARKS_METHODS.COLLECTIONS_LIST, {})
  if (!Array.isArray(data.collections))
    throw new VaultBridgeError('bookmarks-collections-list: collections is not an array')
  return data.collections as BookmarkCollectionSummary[]
}

export async function createCollection(name: string): Promise<string> {
  const data = await call<{ collectionId: unknown }>(BOOKMARKS_METHODS.COLLECTION_CREATE, { name })
  if (typeof data.collectionId !== 'string' || data.collectionId.length === 0)
    throw new VaultBridgeError('bookmarks-collection-create: missing collectionId')
  return data.collectionId
}

export async function listNodes(collectionId: string): Promise<BookmarkNodeRow[]> {
  const data = await call<{ nodes: unknown }>(BOOKMARKS_METHODS.LIST, { collectionId })
  if (!Array.isArray(data.nodes))
    throw new VaultBridgeError('bookmarks-list: nodes is not an array')
  return data.nodes as BookmarkNodeRow[]
}

export async function upsertNodes(collectionId: string, nodes: BookmarkNodeRow[]): Promise<number> {
  if (nodes.length === 0)
    return 0
  const data = await call<{ upserted: unknown }>(BOOKMARKS_METHODS.UPSERT, { collectionId, nodes })
  return typeof data.upserted === 'number' ? data.upserted : nodes.length
}

export async function deleteNodes(collectionId: string, ids: string[]): Promise<number> {
  if (ids.length === 0)
    return 0
  const data = await call<{ deleted: unknown }>(BOOKMARKS_METHODS.DELETE, { collectionId, ids })
  return typeof data.deleted === 'number' ? data.deleted : ids.length
}

export async function upsertDevice(payload: DeviceUpsertPayload): Promise<void> {
  await call<Record<string, unknown>>(BOOKMARKS_METHODS.DEVICE_UPSERT, payload)
}
