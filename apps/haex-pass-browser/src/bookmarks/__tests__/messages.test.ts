import { describe, expect, it } from 'vitest'
import { bookmarkErrorText, BOOKMARKS_NOT_SUPPORTED, shownBookmarkError } from '../messages'

// Shaped like vaultClient's VaultBridgeError, which this test cannot import
// without the background connection.
function bridgeError(message: string, errorCode?: string): Error {
  return Object.assign(new Error(message), { errorCode })
}

describe('bookmarkErrorText', () => {
  it('marks a vault app without bookmark sync', () => {
    expect(bookmarkErrorText(bridgeError('Not supported', 'NOT_SUPPORTED'))).toBe(BOOKMARKS_NOT_SUPPORTED)
  })

  it('keeps every other error as text', () => {
    expect(bookmarkErrorText(bridgeError('Request timeout'))).toBe('Error: Request timeout')
    expect(bookmarkErrorText(null)).toBe('null')
  })
})

describe('shownBookmarkError', () => {
  it('shows the sentence for the marker and every other error as sent', () => {
    expect(shownBookmarkError(BOOKMARKS_NOT_SUPPORTED, 'no bookmarks here')).toBe('no bookmarks here')
    expect(shownBookmarkError('Error: offline', 'no bookmarks here')).toBe('Error: offline')
    expect(shownBookmarkError(undefined, 'no bookmarks here')).toBeUndefined()
  })
})
