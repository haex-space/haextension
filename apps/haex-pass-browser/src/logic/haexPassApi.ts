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

/** One entry of a get-items answer. */
export interface ItemEntry {
  id: string
  title: string
  url: string | null
  /**
   * Username, password and custom fields. `otp` is only a marker with the
   * literal value "TOTP"; the code itself comes from get-totp.
   */
  fields: Record<string, string>
  hasTotp: boolean
  autofillAliases?: Record<string, string[]> | null
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.values(value).every(entry => typeof entry === 'string')
}

/** The well-formed entries of a get-items answer (`{ entries }`). */
export function parseItemEntries(data: unknown): ItemEntry[] {
  const entries = (data as { entries?: unknown } | null | undefined)?.entries
  if (!Array.isArray(entries))
    return []
  return entries.flatMap((value: unknown) => {
    const entry = (value ?? {}) as Partial<Record<keyof ItemEntry, unknown>>
    if (typeof entry.id !== 'string' || typeof entry.title !== 'string' || !isStringRecord(entry.fields))
      return []
    const aliases = entry.autofillAliases
    return [{
      id: entry.id,
      title: entry.title,
      url: typeof entry.url === 'string' ? entry.url : null,
      fields: entry.fields,
      hasTotp: entry.hasTotp === true,
      autofillAliases: typeof aliases === 'object' && aliases !== null ? aliases as Record<string, string[]> : null,
    }]
  })
}

export interface GetTotpResponseData {
  code: string
  /** Seconds until the code expires */
  validFor: number
}

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
