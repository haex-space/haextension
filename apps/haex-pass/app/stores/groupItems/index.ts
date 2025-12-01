import type { IPasswordMenuItem } from '~/types/password'
import { getTableName } from 'drizzle-orm'
import { haexPasswordsGroupItems, haexPasswordsItemDetails } from '~/database'

/**
 * Store for managing the password menu items (groups + items combined)
 * Used by both Tree View (desktop) and Mobile Menu
 */
export const usePasswordMenuStore = defineStore('passwordMenuStore', () => {
  const { currentGroupId, groups } = storeToRefs(usePasswordGroupStore())
  const { items } = storeToRefs(usePasswordItemStore())
  const { search, searchResults } = storeToRefs(useSearchStore())
  const { isMediumScreen } = storeToRefs(useUiStore())

  // Get the actual prefixed table names from Drizzle
  const groupItemsTableName = getTableName(haexPasswordsGroupItems)
  const itemDetailsTableName = getTableName(haexPasswordsItemDetails)

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
        }
      })
    )

    return menuItems
  })

  return {
    groupItems,
  }
})
