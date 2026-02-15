// Re-export API types from haex-pass for shared usage
export { HAEX_PASS_METHODS } from '@haex-pass/api'
export type {
  PasswordConfig,
  GetPasswordConfigResponseData,
  PasswordPreset,
  GetPasswordPresetsResponseData,
} from '@haex-pass/api'

// Message types for extension pages communication (internal extension messaging)
export const MSG_GET_CONNECTION_STATE = 'get-connection-state'
export const MSG_CONNECT = 'connect'
export const MSG_DISCONNECT = 'disconnect'
export const MSG_CONNECTION_STATE = 'connection-state'
export const MSG_CREATE_ITEM = 'create-item'
export const MSG_GET_PASSWORD_CONFIG = 'get-password-config'
export const MSG_GET_PASSWORD_PRESETS = 'get-password-presets'
