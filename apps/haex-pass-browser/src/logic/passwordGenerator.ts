import type { PasswordConfig as VaultPasswordConfig } from './haexPassApi'
import { generatePassword as generate } from '@haex-space/vault-sdk/passgen'

export { initPassgen } from '@haex-space/vault-sdk/passgen'

export interface PasswordConfig {
  length: number
  uppercase: boolean
  lowercase: boolean
  numbers: boolean
  symbols: boolean
  excludeChars: string
  usePattern: boolean
  pattern: string
}

/**
 * A password for `config`, from the one implementation of the generator, the crate `haex-passgen`
 * of the vault-sdk (its WebAssembly build; holzi uses the same crate): rejection sampling and
 * every chosen class at least once. A configuration that allows no password gives `''`.
 * `initPassgen()` from the SDK must have finished first (the popup awaits it before mounting).
 */
export function generatePassword(config: PasswordConfig): string {
  const result = generate(config)
  return 'value' in result ? result.value : ''
}

/** The vault's generator settings, with its empty fields as empty strings. */
export function fromVaultPasswordConfig(config: VaultPasswordConfig): PasswordConfig {
  return {
    length: config.length,
    uppercase: config.uppercase,
    lowercase: config.lowercase,
    numbers: config.numbers,
    symbols: config.symbols,
    excludeChars: config.excludeChars ?? '',
    usePattern: config.usePattern,
    pattern: config.pattern ?? '',
  }
}

// Default config for quick password generation
export const defaultPasswordConfig: PasswordConfig = {
  length: 20,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
  excludeChars: '',
  usePattern: false,
  pattern: '',
}
