import { eq } from 'drizzle-orm'
import type { IPasswordMenuItem } from '~/types/password'
import { haexPasswordsGroupItems, haexPasswordsGroups } from '~/database'

/**
 * Store for moving groups and items
 */
export const useGroupItemsMoveStore = defineStore('groupItemsMoveStore', () => {
  /**
   * Insert items (groups or password items) into a target group
   * Used for drag & drop operations
   */
  const insertGroupItemsAsync = async (
    items: IPasswordMenuItem[],
    groupdId?: string | null
  ) => {
    const haexhubStore = useHaexVaultStore()
    if (!haexhubStore.orm) throw new Error('Database not initialized')

    const { groups } = usePasswordGroupStore()
    const { syncGroupItemsAsync } = usePasswordGroupStore()

    const targetGroup = groups.find((group) => group.id === groupdId)

    for (const item of items) {
      if (item.type === 'group') {
        const updateGroup = groups.find((group) => group.id === item.id)

        if (updateGroup?.parentId === targetGroup?.id) return

        if (updateGroup) {
          updateGroup.parentId = targetGroup?.id ?? null
          await haexhubStore.orm
            .update(haexPasswordsGroups)
            .set(updateGroup)
            .where(eq(haexPasswordsGroups.id, updateGroup.id))
        }
      } else {
        if (targetGroup) {
          await haexhubStore.orm
            .update(haexPasswordsGroupItems)
            .set({ groupId: targetGroup.id, itemId: item.id })
            .where(eq(haexPasswordsGroupItems.itemId, item.id))
        }
      }
    }
    return syncGroupItemsAsync()
  }

  /**
   * Move items (groups or password items) to a target group
   * Used for cut/paste operations
   */
  const moveGroupItemsAsync = async (
    itemIds: string[],
    targetGroupId?: string | null
  ) => {
    const haexhubStore = useHaexVaultStore()
    if (!haexhubStore.orm) throw new Error('Database not initialized')

    const { groups, syncGroupItemsAsync } = usePasswordGroupStore()
    const targetGroup = groups.find((group) => group.id === targetGroupId)

    for (const itemId of itemIds) {
      // Check if it's a group
      const group = groups.find((g) => g.id === itemId)

      if (group) {
        // Move group by updating parentId
        if (group.parentId === targetGroup?.id) continue

        await haexhubStore.orm
          .update(haexPasswordsGroups)
          .set({ parentId: targetGroup?.id ?? null })
          .where(eq(haexPasswordsGroups.id, itemId))
      } else {
        // Move item by updating groupId in group_items
        if (targetGroup) {
          await haexhubStore.orm
            .update(haexPasswordsGroupItems)
            .set({ groupId: targetGroup.id })
            .where(eq(haexPasswordsGroupItems.itemId, itemId))
        }
      }
    }

    await syncGroupItemsAsync()
  }

  return {
    insertGroupItemsAsync,
    moveGroupItemsAsync,
  }
})
