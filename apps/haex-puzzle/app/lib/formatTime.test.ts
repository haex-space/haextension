import { describe, expect, it } from 'vitest'
import { formatElapsed } from './formatTime'

describe('formatElapsed', () => {
  it('formats minutes and seconds', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(65_000)).toBe('1:05')
    expect(formatElapsed(599_999)).toBe('9:59')
  })

  it('adds hours from one hour on', () => {
    expect(formatElapsed(3_600_000)).toBe('1:00:00')
    expect(formatElapsed(3_723_000)).toBe('1:02:03')
  })

  it('treats a negative time as zero', () => {
    expect(formatElapsed(-5)).toBe('0:00')
  })
})
