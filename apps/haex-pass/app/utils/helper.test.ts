import { describe, it, expect } from 'vitest'
import {
  readableFileSize,
  stringToHex,
  hexToString,
  getContrastingTextColor,
  isObject,
  areObjectsEqual,
  getSingleRouteParam,
  isKey,
  filterAsync,
} from './helper'

describe('readableFileSize', () => {
  it('returns "0 KB" for zero', () => {
    expect(readableFileSize(0)).toBe('0 KB')
  })

  it('returns "0 KB" for empty string', () => {
    expect(readableFileSize('')).toBe('0 KB')
  })

  it('returns "0 KB" for undefined', () => {
    expect(readableFileSize()).toBe('0 KB')
  })

  it('formats bytes to KB', () => {
    expect(readableFileSize(1024)).toBe('1.00 KB')
    expect(readableFileSize(2048)).toBe('2.00 KB')
    expect(readableFileSize(512)).toBe('0.50 KB')
  })

  it('formats bytes to MB', () => {
    // Note: readableFileSize uses > 1 not >= 1, so exactly 1 MB shows as KB
    expect(readableFileSize(1.1 * 1024 * 1024)).toBe('1.10 MB')
    expect(readableFileSize(2.5 * 1024 * 1024)).toBe('2.50 MB')
  })

  it('formats bytes to GB', () => {
    expect(readableFileSize(1.1 * 1024 * 1024 * 1024)).toBe('1.10 GB')
  })

  it('formats bytes to TB', () => {
    expect(readableFileSize(1.1 * 1024 * 1024 * 1024 * 1024)).toBe('1.10 TB')
  })

  it('handles string input', () => {
    expect(readableFileSize('1024')).toBe('1.00 KB')
  })
})

describe('stringToHex', () => {
  it('converts simple string to hex', () => {
    expect(stringToHex('ABC')).toBe('414243')
  })

  it('converts empty string', () => {
    expect(stringToHex('')).toBe('')
  })

  it('converts string with special chars', () => {
    expect(stringToHex('Hi!')).toBe('486921')
  })

  it('converts unicode correctly', () => {
    // Each char is converted individually
    expect(stringToHex('a')).toBe('61')
    expect(stringToHex('z')).toBe('7a')
    expect(stringToHex('0')).toBe('30')
  })
})

describe('hexToString', () => {
  it('converts hex to string', () => {
    expect(hexToString('414243')).toBe('ABC')
  })

  it('converts empty string', () => {
    expect(hexToString('')).toBe('')
  })

  it('handles null/undefined', () => {
    expect(hexToString(null as unknown as string)).toBe('')
    expect(hexToString(undefined as unknown as string)).toBe('')
  })

  it('roundtrips with stringToHex', () => {
    const original = 'Hello World!'
    expect(hexToString(stringToHex(original))).toBe(original)
  })
})

describe('getContrastingTextColor', () => {
  it('returns black for null/undefined', () => {
    expect(getContrastingTextColor(null)).toBe('black')
    expect(getContrastingTextColor(undefined)).toBe('black')
  })

  it('returns black for white background', () => {
    expect(getContrastingTextColor('#FFFFFF')).toBe('black')
    expect(getContrastingTextColor('#ffffff')).toBe('black')
    expect(getContrastingTextColor('FFFFFF')).toBe('black')
  })

  it('returns white for black background', () => {
    expect(getContrastingTextColor('#000000')).toBe('white')
    expect(getContrastingTextColor('000000')).toBe('white')
  })

  it('returns white for dark colors', () => {
    expect(getContrastingTextColor('#333333')).toBe('white')
    expect(getContrastingTextColor('#1a1a1a')).toBe('white')
  })

  it('returns black for light colors', () => {
    expect(getContrastingTextColor('#EEEEEE')).toBe('black')
    expect(getContrastingTextColor('#F0F0F0')).toBe('black')
  })

  it('handles shorthand hex', () => {
    expect(getContrastingTextColor('#FFF')).toBe('black')
    expect(getContrastingTextColor('#000')).toBe('white')
    expect(getContrastingTextColor('F00')).toBe('white') // Red
  })

  it('returns black for invalid hex', () => {
    expect(getContrastingTextColor('#12345')).toBe('black')
    expect(getContrastingTextColor('invalid')).toBe('black')
  })
})

describe('isObject', () => {
  it('returns true for objects', () => {
    expect(isObject({})).toBe(true)
    expect(isObject({ a: 1 })).toBe(true)
    expect(isObject([])).toBe(true) // Arrays are objects in JS
  })

  it('returns false for primitives', () => {
    expect(isObject(null)).toBe(false)
    expect(isObject(undefined)).toBe(false)
    expect(isObject('string')).toBe(false)
    expect(isObject(123)).toBe(false)
    expect(isObject(true)).toBe(false)
  })
})

describe('areObjectsEqual', () => {
  it('returns true for identical primitives', () => {
    expect(areObjectsEqual(1, 1)).toBe(true)
    expect(areObjectsEqual('a', 'a')).toBe(true)
    expect(areObjectsEqual(true, true)).toBe(true)
  })

  it('returns false for different primitives', () => {
    expect(areObjectsEqual(1, 2)).toBe(false)
    expect(areObjectsEqual('a', 'b')).toBe(false)
  })

  it('treats null and empty string as equal', () => {
    expect(areObjectsEqual(null, '')).toBe(true)
    expect(areObjectsEqual('', null)).toBe(true)
  })

  it('returns true for equal objects', () => {
    expect(areObjectsEqual({ a: 1 }, { a: 1 })).toBe(true)
    expect(areObjectsEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true)
  })

  it('returns false for different objects', () => {
    expect(areObjectsEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(areObjectsEqual({ a: 1 }, { b: 1 })).toBe(false)
    expect(areObjectsEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
  })

  it('handles nested objects', () => {
    expect(areObjectsEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true)
    expect(areObjectsEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false)
  })

  it('handles null/empty in nested objects', () => {
    expect(areObjectsEqual({ a: null }, { a: '' })).toBe(true)
  })
})

describe('getSingleRouteParam', () => {
  it('returns empty string for undefined', () => {
    expect(getSingleRouteParam(undefined)).toBe('')
  })

  it('returns string as-is', () => {
    expect(getSingleRouteParam('test')).toBe('test')
  })

  it('returns first element of array', () => {
    expect(getSingleRouteParam(['first', 'second'])).toBe('first')
  })

  it('returns empty string for empty array', () => {
    expect(getSingleRouteParam([])).toBe('')
  })

  it('decodes URI components', () => {
    expect(getSingleRouteParam('hello%20world')).toBe('hello world')
  })
})

describe('isKey', () => {
  it('returns true for existing key', () => {
    const obj = { a: 1, b: 2 }
    expect(isKey(obj, 'a')).toBe(true)
    expect(isKey(obj, 'b')).toBe(true)
  })

  it('returns false for non-existing key', () => {
    const obj = { a: 1 }
    expect(isKey(obj, 'b')).toBe(false)
  })
})

describe('filterAsync', () => {
  it('filters array with async predicate', async () => {
    const arr = [1, 2, 3, 4, 5]
    const result = await filterAsync(arr, async (x) => x % 2 === 0)
    expect(result).toEqual([2, 4])
  })

  it('handles empty array', async () => {
    const result = await filterAsync([], async () => true)
    expect(result).toEqual([])
  })

  it('filters all elements', async () => {
    const arr = [1, 2, 3]
    const result = await filterAsync(arr, async () => false)
    expect(result).toEqual([])
  })

  it('keeps all elements', async () => {
    const arr = [1, 2, 3]
    const result = await filterAsync(arr, async () => true)
    expect(result).toEqual([1, 2, 3])
  })
})
