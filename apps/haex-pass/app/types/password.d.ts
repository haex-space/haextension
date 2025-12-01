export interface IPasswordMenuItem {
  color?: string | null
  icon?: string | null
  id: string
  name: string | null
  type: 'group' | 'item'
  inTrash?: boolean
  // Additional fields for items (not groups)
  username?: string | null
  url?: string | null
}
