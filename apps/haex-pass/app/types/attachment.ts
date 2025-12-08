import type { SelectHaexPasswordsItemBinaries } from '~/database'

export interface AttachmentWithSize extends SelectHaexPasswordsItemBinaries {
  size?: number
  data?: string
}
