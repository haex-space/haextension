// Runtime message type constants for extension-page <-> background
// communication about bookmark sync (plain `browser.runtime.sendMessage`,
// same convention as the existing MSG_* constants in `logic/messages.ts`).
// Shared between Onboarding/Options/Popup (senders) and background/main.ts +
// syncService.ts (handlers), so both sides import the same string.

import type { BrowserFamily } from './model'

export const BOOKMARKS_LIST_COLLECTIONS = 'BOOKMARKS_LIST_COLLECTIONS'
export const BOOKMARKS_ONBOARDING_DECISION = 'BOOKMARKS_ONBOARDING_DECISION'
export const BOOKMARKS_SYNC_NOW = 'BOOKMARKS_SYNC_NOW'
export const BOOKMARKS_SWITCH_COLLECTION = 'BOOKMARKS_SWITCH_COLLECTION'
export const BOOKMARKS_CONFIRM_DELETIONS = 'BOOKMARKS_CONFIRM_DELETIONS'
export const BOOKMARKS_REJECT_DELETIONS = 'BOOKMARKS_REJECT_DELETIONS'
export const BOOKMARKS_GET_STATUS = 'BOOKMARKS_GET_STATUS'

export interface DeviceIdentity {
  replicaId: string
  browserFamily: BrowserFamily
  deviceLabel: string
}

export type OnboardingDecisionMessage
  = | { type: typeof BOOKMARKS_ONBOARDING_DECISION, decision: 'disabled' }
    | ({ type: typeof BOOKMARKS_ONBOARDING_DECISION, decision: 'create', name: string } & DeviceIdentity)
    | ({ type: typeof BOOKMARKS_ONBOARDING_DECISION, decision: 'activate', collectionId: string, collectionName: string } & DeviceIdentity)

export interface BackgroundAckResponse {
  success: boolean
  error?: string
}

/**
 * Reduced status for Options/Popup — deliberately excludes the full
 * snapshot/bindings (which carry url/title for every node); only counts and
 * settings-level fields cross the messaging boundary.
 */
export type BookmarkStatus
  = | { mode: 'disabled' }
    | {
      mode: 'active'
      collectionId: string
      collectionName: string
      replicaId: string
      browserFamily: BrowserFamily
      deviceLabel: string
      dirty: boolean
      lastSyncAt: string | null
      lastError: string | null
      ownCollectionMissing: boolean
      pendingDeletionReview: { deletedCount: number, mappedNodeCountBefore: number } | null
    }
