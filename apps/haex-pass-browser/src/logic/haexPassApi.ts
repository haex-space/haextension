// Wire contract of the vault's password methods, as served by holzi's
// external bridge (spec 049). Carried over from the archived haex-pass app's
// `app/api/external.ts`, which defined it first.

export const HAEX_PASS_METHODS = {
  GET_ITEMS: 'get-items',
  GET_TOTP: 'get-totp',
  CREATE_ITEM: 'create-item',
  UPDATE_ITEM: 'update-item',
  GET_PASSWORD_CONFIG: 'get-password-config',
  GET_PASSWORD_PRESETS: 'get-password-presets',
  PASSKEY_CREATE: 'passkey-create',
  PASSKEY_GET: 'passkey-get',
  PASSKEY_LIST: 'passkey-list',
} as const

/** Password generator settings as the vault sends them. */
export interface PasswordConfig {
  /** 4-128 */
  length: number
  uppercase: boolean
  lowercase: boolean
  numbers: boolean
  symbols: boolean
  excludeChars: string | null
  usePattern: boolean
  pattern: string | null
}

export interface GetPasswordConfigResponseData {
  /** null when the vault has no default preset */
  config: PasswordConfig | null
  presetName: string | null
}

export interface PasswordPreset {
  id: string
  name: string
  isDefault: boolean
  config: PasswordConfig
}

export interface GetPasswordPresetsResponseData {
  presets: PasswordPreset[]
}
