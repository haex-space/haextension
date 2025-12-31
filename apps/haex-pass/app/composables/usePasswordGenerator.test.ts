import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePasswordGenerator, type IPasswordConfig } from './usePasswordGenerator'

describe('usePasswordGenerator', () => {
  const { generate } = usePasswordGenerator()

  // Mock crypto.getRandomValues for deterministic tests
  beforeEach(() => {
    let counter = 0
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      if (array instanceof Uint32Array) {
        for (let i = 0; i < array.length; i++) {
          array[i] = counter++
        }
      }
      return array
    })
  })

  describe('standard generation', () => {
    it('generates password of correct length', () => {
      const config: IPasswordConfig = {
        length: 16,
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: false,
        excludeChars: null,
        usePattern: false,
        pattern: null,
      }
      const password = generate(config)
      expect(password.length).toBe(16)
    })

    it('generates only uppercase when specified', () => {
      const config: IPasswordConfig = {
        length: 20,
        uppercase: true,
        lowercase: false,
        numbers: false,
        symbols: false,
        excludeChars: null,
        usePattern: false,
        pattern: null,
      }
      const password = generate(config)
      expect(password).toMatch(/^[A-Z]+$/)
    })

    it('generates only lowercase when specified', () => {
      const config: IPasswordConfig = {
        length: 20,
        uppercase: false,
        lowercase: true,
        numbers: false,
        symbols: false,
        excludeChars: null,
        usePattern: false,
        pattern: null,
      }
      const password = generate(config)
      expect(password).toMatch(/^[a-z]+$/)
    })

    it('generates only numbers when specified', () => {
      const config: IPasswordConfig = {
        length: 20,
        uppercase: false,
        lowercase: false,
        numbers: true,
        symbols: false,
        excludeChars: null,
        usePattern: false,
        pattern: null,
      }
      const password = generate(config)
      expect(password).toMatch(/^[0-9]+$/)
    })

    it('generates only symbols when specified', () => {
      const config: IPasswordConfig = {
        length: 20,
        uppercase: false,
        lowercase: false,
        numbers: false,
        symbols: true,
        excludeChars: null,
        usePattern: false,
        pattern: null,
      }
      const password = generate(config)
      expect(password).toMatch(/^[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]+$/)
    })

    it('returns empty string when no character sets selected', () => {
      const config: IPasswordConfig = {
        length: 16,
        uppercase: false,
        lowercase: false,
        numbers: false,
        symbols: false,
        excludeChars: null,
        usePattern: false,
        pattern: null,
      }
      const password = generate(config)
      expect(password).toBe('')
    })

    it('excludes specified characters', () => {
      const config: IPasswordConfig = {
        length: 100,
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: false,
        excludeChars: 'ABCabc123',
        usePattern: false,
        pattern: null,
      }
      const password = generate(config)
      expect(password).not.toMatch(/[ABCabc123]/)
    })
  })

  describe('pattern generation', () => {
    it('generates password matching pattern', () => {
      const config: IPasswordConfig = {
        length: 0, // ignored when using pattern
        uppercase: false,
        lowercase: false,
        numbers: false,
        symbols: false,
        excludeChars: null,
        usePattern: true,
        pattern: 'Cvccvcc',
      }
      const password = generate(config)
      expect(password.length).toBe(7)
    })

    it('uses lowercase consonants for c', () => {
      const config: IPasswordConfig = {
        length: 0,
        uppercase: false,
        lowercase: false,
        numbers: false,
        symbols: false,
        excludeChars: null,
        usePattern: true,
        pattern: 'ccccc',
      }
      const password = generate(config)
      expect(password).toMatch(/^[bcdfghjklmnpqrstvwxyz]+$/)
    })

    it('uses uppercase consonants for C', () => {
      const config: IPasswordConfig = {
        length: 0,
        uppercase: false,
        lowercase: false,
        numbers: false,
        symbols: false,
        excludeChars: null,
        usePattern: true,
        pattern: 'CCCCC',
      }
      const password = generate(config)
      expect(password).toMatch(/^[BCDFGHJKLMNPQRSTVWXYZ]+$/)
    })

    it('uses lowercase vowels for v', () => {
      const config: IPasswordConfig = {
        length: 0,
        uppercase: false,
        lowercase: false,
        numbers: false,
        symbols: false,
        excludeChars: null,
        usePattern: true,
        pattern: 'vvvvv',
      }
      const password = generate(config)
      expect(password).toMatch(/^[aeiou]+$/)
    })

    it('uses uppercase vowels for V', () => {
      const config: IPasswordConfig = {
        length: 0,
        uppercase: false,
        lowercase: false,
        numbers: false,
        symbols: false,
        excludeChars: null,
        usePattern: true,
        pattern: 'VVVVV',
      }
      const password = generate(config)
      expect(password).toMatch(/^[AEIOU]+$/)
    })

    it('uses digits for d', () => {
      const config: IPasswordConfig = {
        length: 0,
        uppercase: false,
        lowercase: false,
        numbers: false,
        symbols: false,
        excludeChars: null,
        usePattern: true,
        pattern: 'ddddd',
      }
      const password = generate(config)
      expect(password).toMatch(/^[0-9]+$/)
    })

    it('uses all lowercase for a', () => {
      const config: IPasswordConfig = {
        length: 0,
        uppercase: false,
        lowercase: false,
        numbers: false,
        symbols: false,
        excludeChars: null,
        usePattern: true,
        pattern: 'aaaaa',
      }
      const password = generate(config)
      expect(password).toMatch(/^[a-z]+$/)
    })

    it('uses all uppercase for A', () => {
      const config: IPasswordConfig = {
        length: 0,
        uppercase: false,
        lowercase: false,
        numbers: false,
        symbols: false,
        excludeChars: null,
        usePattern: true,
        pattern: 'AAAAA',
      }
      const password = generate(config)
      expect(password).toMatch(/^[A-Z]+$/)
    })

    it('uses symbols for s', () => {
      const config: IPasswordConfig = {
        length: 0,
        uppercase: false,
        lowercase: false,
        numbers: false,
        symbols: false,
        excludeChars: null,
        usePattern: true,
        pattern: 'sssss',
      }
      const password = generate(config)
      expect(password).toMatch(/^[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]+$/)
    })

    it('keeps literal characters in pattern', () => {
      const config: IPasswordConfig = {
        length: 0,
        uppercase: false,
        lowercase: false,
        numbers: false,
        symbols: false,
        excludeChars: null,
        usePattern: true,
        pattern: 'X-Y-Z',
      }
      const password = generate(config)
      expect(password).toBe('X-Y-Z')
    })

    it('mixes pattern characters and literals', () => {
      const config: IPasswordConfig = {
        length: 0,
        uppercase: false,
        lowercase: false,
        numbers: false,
        symbols: false,
        excludeChars: null,
        usePattern: true,
        pattern: 'd-d-d-d',
      }
      const password = generate(config)
      expect(password).toMatch(/^\d-\d-\d-\d$/)
    })
  })

  describe('edge cases', () => {
    it('handles zero length', () => {
      const config: IPasswordConfig = {
        length: 0,
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: true,
        excludeChars: null,
        usePattern: false,
        pattern: null,
      }
      const password = generate(config)
      expect(password).toBe('')
    })

    it('handles empty pattern', () => {
      const config: IPasswordConfig = {
        length: 0,
        uppercase: false,
        lowercase: false,
        numbers: false,
        symbols: false,
        excludeChars: null,
        usePattern: true,
        pattern: '',
      }
      const password = generate(config)
      expect(password).toBe('')
    })

    it('falls back to standard when pattern is null with usePattern true', () => {
      const config: IPasswordConfig = {
        length: 10,
        uppercase: true,
        lowercase: false,
        numbers: false,
        symbols: false,
        excludeChars: null,
        usePattern: true,
        pattern: null,
      }
      const password = generate(config)
      expect(password.length).toBe(10)
      expect(password).toMatch(/^[A-Z]+$/)
    })
  })
})
