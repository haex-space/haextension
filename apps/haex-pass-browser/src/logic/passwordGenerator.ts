export interface PasswordConfig {
  length: number
  uppercase: boolean
  lowercase: boolean
  numbers: boolean
  symbols: boolean
  excludeChars: string | null
  usePattern: boolean
  pattern: string | null
}

const getRandomChar = (charset: string): string => {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  const randomValue = array[0] ?? 0
  const index = randomValue % charset.length
  return charset.charAt(index)
}

export function generatePassword(config: PasswordConfig): string {
  // 1. Pattern mode
  if (config.usePattern && config.pattern) {
    const patternMap: Record<string, string> = {
      c: 'bcdfghjklmnpqrstvwxyz', // lowercase consonant
      C: 'BCDFGHJKLMNPQRSTVWXYZ', // uppercase consonant
      v: 'aeiou', // lowercase vowel
      V: 'AEIOU', // uppercase vowel
      d: '0123456789', // digit
      a: 'abcdefghijklmnopqrstuvwxyz', // any lowercase
      A: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', // any uppercase
      s: '!@#$%^&*()_+-=[]{}|;:,.<>?', // symbol
    }

    return config.pattern
      .split('')
      .map(char => patternMap[char] ? getRandomChar(patternMap[char]) : char)
      .join('')
  }

  // 2. Standard mode
  const charset = {
    uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lowercase: 'abcdefghijklmnopqrstuvwxyz',
    numbers: '0123456789',
    symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  }

  let chars = ''
  if (config.uppercase) {
    chars += charset.uppercase
  }
  if (config.lowercase) {
    chars += charset.lowercase
  }
  if (config.numbers) {
    chars += charset.numbers
  }
  if (config.symbols) {
    chars += charset.symbols
  }

  if (config.excludeChars) {
    const excludeSet = new Set(config.excludeChars.split(''))
    chars = chars
      .split('')
      .filter(c => !excludeSet.has(c))
      .join('')
  }

  if (!chars) {
    return ''
  }

  const array = new Uint32Array(config.length)
  crypto.getRandomValues(array)
  return Array.from(array)
    .map(x => chars[x % chars.length])
    .join('')
}

// Default config for quick password generation
export const defaultPasswordConfig: PasswordConfig = {
  length: 20,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
  excludeChars: null,
  usePattern: false,
  pattern: null,
}
