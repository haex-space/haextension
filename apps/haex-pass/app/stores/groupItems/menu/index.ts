import type { IPasswordMenuItem } from '~/types/password'
import { getTableName } from 'drizzle-orm'
import { haexPasswordsGroupItems, haexPasswordsItemDetails } from '~/database'

export type SortField = 'name' | 'createdAt' | 'updatedAt'
export type SortDirection = 'asc' | 'desc'

/**
 * Store for managing the group items menu
 * Used by both Tree View (desktop) and Mobile Menu
 */
export const useGroupItemsMenuStore = defineStore('groupItemsMenuStore', () => {
  const { currentGroupId, groups } = storeToRefs(usePasswordGroupStore())
  const { items } = storeToRefs(usePasswordItemStore())
  const { search, searchResults } = storeToRefs(useSearchStore())
  const { isMediumScreen } = storeToRefs(useUiStore())

  // Sort settings
  const sortField = ref<SortField>('name')
  const sortDirection = ref<SortDirection>('asc')

  const setSort = (field: SortField) => {
    if (sortField.value === field) {
      sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
    } else {
      sortField.value = field
      sortDirection.value = field === 'name' ? 'asc' : 'desc'
    }
  }

  const sortByName = () => setSort('name')
  const sortByDateCreated = () => setSort('createdAt')
  const sortByDateModified = () => setSort('updatedAt')

  // Get the actual prefixed table names from Drizzle
  const groupItemsTableName = getTableName(haexPasswordsGroupItems)
  const itemDetailsTableName = getTableName(haexPasswordsItemDetails)

  /**
   * Sort menu items based on current sort settings
   */
  const sortItems = (items: IPasswordMenuItem[]): IPasswordMenuItem[] => {
    const multiplier = sortDirection.value === 'asc' ? 1 : -1

    return [...items].sort((a, b) => {
      // Groups always come first
      if (a.type === 'group' && b.type !== 'group') return -1
      if (a.type !== 'group' && b.type === 'group') return 1

      let comparison = 0

      switch (sortField.value) {
        case 'name':
          comparison = (a.name || '').localeCompare(b.name || '')
          break
        case 'createdAt': {
          const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0
          const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0
          comparison = aDate - bDate
          break
        }
        case 'updatedAt': {
          const aTime = a.updatedAt instanceof Date ? a.updatedAt.getTime() : (a.updatedAt || 0)
          const bTime = b.updatedAt instanceof Date ? b.updatedAt.getTime() : (b.updatedAt || 0)
          comparison = (aTime as number) - (bTime as number)
          break
        }
      }

      return comparison * multiplier
    })
  }

  /**
   * Combined list of groups and items for the current context
   * Filters based on:
   * - Current group (parent hierarchy)
   * - Search term
   * - Screen size (groups hidden on desktop in list view)
   */
  const groupItems = computed<IPasswordMenuItem[]>(() => {
    const menuItems: IPasswordMenuItem[] = []

    // When searching, only show groups if search is empty
    // On medium screens and up, don't show groups (they're in the tree menu)
    const filteredGroups =
      search.value || isMediumScreen.value
        ? [] // Don't show groups when searching or on desktop
        : groups.value.filter(
            (group) => group.parentId == currentGroupId.value
          )

    const filteredItems = search.value
      ? searchResults.value || []
      : items.value.filter((item) => {
          const itemRecord = item as Record<string, Record<string, unknown>>
          return itemRecord[groupItemsTableName]?.groupId == currentGroupId.value
        })

    // Map groups to menu items
    menuItems.push(
      ...filteredGroups.map<IPasswordMenuItem>((group) => ({
        color: group.color,
        icon: group.icon || 'mdi:folder',
        id: group.id,
        name: group.name,
        type: 'group',
        createdAt: group.createdAt,
        updatedAt: group.updateAt,
      }))
    )

    // Map items to menu items
    menuItems.push(
      ...filteredItems.map<IPasswordMenuItem>((item) => {
        const itemRecord = item as Record<string, Record<string, unknown>>
        const details = itemRecord[itemDetailsTableName]
        return {
          color: details?.color as string | null,
          icon: details?.icon as string | null,
          id: details?.id as string,
          name: details?.title as string | null,
          type: 'item',
          username: details?.username as string | null,
          url: details?.url as string | null,
          createdAt: details?.createdAt as string | null,
          updatedAt: details?.updateAt as Date | number | null,
        }
      })
    )

    return sortItems(menuItems)
  })

  /**
   * Get the type of an item by its ID
   */
  const getItemType = (id: string): 'group' | 'item' | null => {
    const item = groupItems.value.find((item) => item.id === id)
    return item?.type ?? null
  }

  return {
    groupItems,
    sortField,
    sortDirection,
    sortByName,
    sortByDateCreated,
    sortByDateModified,
    getItemType,
  }
})
