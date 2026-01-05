import { eq, sql } from 'drizzle-orm'
import type { IPasswordMenuItem } from '~/types/password'
import type { SelectHaexPasswordsGroups } from '~/database'
import { haexPasswordsGroups, haexPasswordsGroupItems } from '~/database'
import { cleanupOrphanedBinariesAsync } from '~/utils/cleanup'
import { trashId } from './index'

/**
 * Store for deleting groups and items (with trash support)
 */
export const useGroupItemsDeleteStore = defineStore('groupItemsDeleteStore', () => {
  const { $i18n } = useNuxtApp()

  // Dialog state
  const showDialog = ref(false)
  const itemName = ref<string>('')
  const isFinal = ref(false)
  const groupsToDelete = ref<string[]>([])
  const itemsToDelete = ref<string[]>([])

  // Progress state for operations
  const isProcessing = ref(false)
  const processingProgress = ref(0) // 0-100
  const processingTotal = ref(0)
  const processingCurrent = ref(0)

  /**
   * Create trash group if it doesn't exist.
   *
   * IMPORTANT: This also handles the case where the trash group was previously
   * deleted (tombstoned). Since the trash group uses a fixed ID ('trash') as
   * primary key, we can't simply insert a new row if a tombstoned one exists.
   * Instead, we revive the tombstoned row by clearing the haex_tombstone flag
   * and resetting to default values.
   *
   * This is safe for the trash group because:
   * - It has no user-defined data (just a container)
   * - It always has the same default values (name, icon)
   * - Users expect standard trash behavior when recreated
   */
  const createTrashIfNotExistsAsync = async () => {
    const haexVaultStore = useHaexVaultStore()
    if (!haexVaultStore.orm) throw new Error('Database not initialized')

    const { readGroupAsync, addGroupAsync } = usePasswordGroupStore()

    // First, check if a non-tombstoned trash group exists
    const exists = await readGroupAsync(trashId)
    if (exists) return true

    // Check if a tombstoned trash group exists (bypassing CRDT filter)
    // We need raw SQL because Drizzle queries automatically filter out tombstoned rows
    const tableName = haexPasswordsGroups._.name
    const tombstonedResult = await haexVaultStore.orm.all<{ id: string; haex_tombstone: string | null }>(
      sql`SELECT id, haex_tombstone FROM ${sql.identifier(tableName)} WHERE id = ${trashId}`
    )

    if (tombstonedResult.length > 0 && tombstonedResult[0]?.haex_tombstone) {
      // Tombstoned trash group exists - revive it by clearing the tombstone flag
      // and resetting to default values
      console.log('[Trash] Reviving tombstoned trash group')
      await haexVaultStore.orm.run(
        sql`UPDATE ${sql.identifier(tableName)}
            SET haex_tombstone = NULL,
                name = 'Trash',
                icon = 'mdi:trash-outline',
                parent_id = NULL,
                description = NULL,
                color = NULL,
                sort_order = NULL
            WHERE id = ${trashId}`
      )
      return true
    }

    // No trash group exists at all - create a new one
    return addGroupAsync({
      name: 'Trash',
      id: trashId,
      icon: 'mdi:trash-outline',
      parentId: null,
    })
  }

  /**
   * Delete a group (move to trash or permanently delete)
   * @param groupId - Group ID to delete
   * @param final - If true, permanently delete. If false, move to trash
   */
  const deleteGroupAsync = async (groupId: string, final: boolean = false) => {
    const haexVaultStore = useHaexVaultStore()
    if (!haexVaultStore.orm) throw new Error('Database not initialized')

    const { updateParentAsync, getChildGroupsRecursiveAsync } = usePasswordGroupStore()
    const { deleteAsync: deleteItemAsync } = usePasswordItemStore()

    if (final || groupId === trashId) {
      // Get all items in this group and its children before deleting
      // This is necessary because CASCADE only deletes the group_items relation, not the actual items
      const groupIds = [groupId]
      const childGroups = await getChildGroupsRecursiveAsync(groupId)
      groupIds.push(...childGroups.map(g => g.id))

      console.log('[Delete] Deleting groups:', groupIds)

      // Get all item IDs in these groups
      const itemIdsToDelete: string[] = []
      for (const gId of groupIds) {
        const groupItems = await haexVaultStore.orm
          .select({ itemId: haexPasswordsGroupItems.itemId })
          .from(haexPasswordsGroupItems)
          .where(eq(haexPasswordsGroupItems.groupId, gId))
        console.log(`[Delete] Group ${gId} has items:`, groupItems.map(gi => gi.itemId))
        itemIdsToDelete.push(...groupItems.map(gi => gi.itemId).filter((id): id is string => id !== null))
      }

      console.log('[Delete] Total items to delete:', itemIdsToDelete.length, itemIdsToDelete)

      // Delete all items using the proper deleteAsync function
      // This handles key_values, binaries, snapshots, and all related data
      for (const itemId of itemIdsToDelete) {
        console.log('[Delete] Deleting item:', itemId)
        await deleteItemAsync(itemId, true)
        processingCurrent.value++
        processingProgress.value = Math.round((processingCurrent.value / processingTotal.value) * 100)
      }

      // Now delete the group (child groups will cascade)
      console.log('[Delete] Deleting group:', groupId)
      return await haexVaultStore.orm
        .delete(haexPasswordsGroups)
        .where(eq(haexPasswordsGroups.id, groupId))
    } else {
      // Move to trash - only update parentId, preserve all other fields
      if (await createTrashIfNotExistsAsync())
        await updateParentAsync(groupId, trashId)
    }
  }

  /**
   * Prepare groups for deletion
   * Determines which groups to delete and whether it's a final delete
   */
  const prepareDeleteGroups = (selectedIds: string[]) => {
    const { isGroupInTrash } = useGroupTreeStore()

    // Check which selected groups are in trash
    const groupsInTrash = selectedIds.filter((id) => isGroupInTrash(id))
    const groupsNotInTrash = selectedIds.filter((id) => !isGroupInTrash(id))

    // Determine which groups to delete and if it's final
    if (groupsNotInTrash.length > 0) {
      // If any groups are not in trash, only delete those (move to trash)
      return {
        groupsToDelete: groupsNotInTrash,
        isFinal: false,
      }
    } else {
      // All groups are in trash - final delete
      return {
        groupsToDelete: groupsInTrash,
        isFinal: true,
      }
    }
  }

  // === Dialog Methods ===

  const openDialog = (deleteData: {
    groups: string[]
    items: string[]
    final: boolean
    itemName: string
  }) => {
    groupsToDelete.value = deleteData.groups
    itemsToDelete.value = deleteData.items
    isFinal.value = deleteData.final
    itemName.value = deleteData.itemName
    showDialog.value = true
  }

  const deleteFromTree = (group: SelectHaexPasswordsGroups) => {
    const selectionStore = useSelectionStore()

    // If the group is not already selected, clear selection and select only this one
    if (!selectionStore.isSelected(group.id)) {
      selectionStore.clearSelection()
      selectionStore.selectItem(group.id)
    }

    // Get the groups to delete and whether it's a final delete
    const selectedIds = Array.from(selectionStore.selectedItems)
    const { groupsToDelete: toDelete, isFinal: final } = prepareDeleteGroups(selectedIds)

    // Set dialog name based on selection count
    const deleteCount = toDelete.length
    const name = deleteCount === 1
      ? group.name || 'Untitled'
      : $i18n.t('itemCount', { count: deleteCount })

    openDialog({
      groups: toDelete,
      items: [],
      final,
      itemName: name,
    })
  }

  const deleteFromMobile = (item: IPasswordMenuItem) => {
    const { groups } = usePasswordGroupStore()
    const { isGroupInTrash } = useGroupTreeStore()
    const { items } = usePasswordItemStore()
    const selectionStore = useSelectionStore()

    // If the item is not already selected, clear selection and select only this one
    if (!selectionStore.isSelected(item.id)) {
      selectionStore.clearSelection()
      selectionStore.selectItem(item.id)
    }

    const selectedIds = Array.from(selectionStore.selectedItems)

    // Separate groups and items from selection
    const selectedGroupIds = selectedIds.filter((id) =>
      groups.some((g) => g.id === id)
    )
    const selectedItemIds = selectedIds.filter((id) =>
      !selectedGroupIds.includes(id)
    )

    // Prepare delete for groups
    const groupsResult = selectedGroupIds.length > 0
      ? prepareDeleteGroups(selectedGroupIds)
      : { groupsToDelete: [], isFinal: false }

    // Prepare delete for items (inline logic)
    const itemsInTrash = selectedItemIds.filter((itemId) => {
      const itemFound = items.find((i) => i?.haex_passwords_item_details?.id === itemId)
      const groupId = itemFound?.haex_passwords_group_items?.groupId
      return groupId ? isGroupInTrash(groupId) : false
    })

    const itemsNotInTrash = selectedItemIds.filter((itemId) => !itemsInTrash.includes(itemId))

    const itemsResult = itemsNotInTrash.length > 0
      ? { itemsToDelete: itemsNotInTrash, isFinal: false }
      : { itemsToDelete: itemsInTrash, isFinal: true }

    // Combine results - final is only true if both are true
    const final = groupsResult.isFinal && itemsResult.isFinal

    // Determine item name for dialog
    const totalCount = groupsResult.groupsToDelete.length + itemsResult.itemsToDelete.length
    const name = totalCount === 1
      ? item.name || 'Untitled'
      : $i18n.t('itemCount', { count: totalCount })

    openDialog({
      groups: groupsResult.groupsToDelete,
      items: itemsResult.itemsToDelete,
      final,
      itemName: name,
    })
  }

  const confirmDeleteAsync = async () => {
    const haexVaultStore = useHaexVaultStore()
    const { deleteAsync: deleteItem, syncItemsAsync } = usePasswordItemStore()
    const { syncGroupItemsAsync, getChildGroupsRecursiveAsync } = usePasswordGroupStore()
    const selectionStore = useSelectionStore()

    // Initialize progress tracking
    isProcessing.value = true
    processingCurrent.value = 0
    processingProgress.value = 0

    // Calculate total operations
    // For final group deletes, we need to count all items within groups
    let totalOperations = itemsToDelete.value.length

    if (isFinal.value && haexVaultStore.orm) {
      // Count items in all groups that will be deleted
      for (const groupId of groupsToDelete.value) {
        const groupIds = [groupId]
        const childGroups = await getChildGroupsRecursiveAsync(groupId)
        groupIds.push(...childGroups.map(g => g.id))

        for (const gId of groupIds) {
          const groupItems = await haexVaultStore.orm
            .select({ itemId: haexPasswordsGroupItems.itemId })
            .from(haexPasswordsGroupItems)
            .where(eq(haexPasswordsGroupItems.groupId, gId))
          totalOperations += groupItems.filter(gi => gi.itemId !== null).length
        }
      }
    } else {
      // For non-final deletes, just count groups
      totalOperations += groupsToDelete.value.length
    }

    processingTotal.value = totalOperations

    try {
      // Delete groups
      for (const groupId of groupsToDelete.value) {
        await deleteGroupAsync(groupId, isFinal.value)
        // Only update progress for non-final deletes (final deletes update in deleteGroupAsync)
        if (!isFinal.value) {
          processingCurrent.value++
          processingProgress.value = Math.round((processingCurrent.value / processingTotal.value) * 100)
        }
      }

      // Delete items
      for (const itemId of itemsToDelete.value) {
        await deleteItem(itemId, isFinal.value)
        processingCurrent.value++
        processingProgress.value = Math.round((processingCurrent.value / processingTotal.value) * 100)
      }

      // Cleanup orphaned binaries after all deletions (only for final deletes)
      if (isFinal.value && haexVaultStore.orm) {
        const cleanedBinaries = await cleanupOrphanedBinariesAsync(haexVaultStore.orm)
        console.log('[Delete] Cleaned up orphaned binaries:', cleanedBinaries)
      }

      // Sync groups and items
      await syncGroupItemsAsync()
      await syncItemsAsync()

      selectionStore.clearSelection()
    } finally {
      isProcessing.value = false
      processingProgress.value = 0
      processingCurrent.value = 0
      processingTotal.value = 0
    }

    closeDialog()
  }

  const closeDialog = () => {
    showDialog.value = false
    groupsToDelete.value = []
    itemsToDelete.value = []
    isFinal.value = false
  }

  return {
    // Dialog state
    showDialog,
    itemName,
    isFinal,
    groupsToDelete,
    itemsToDelete,
    // Progress state
    isProcessing,
    processingProgress,
    processingTotal,
    processingCurrent,
    // Delete functions
    createTrashIfNotExistsAsync,
    deleteGroupAsync,
    prepareDeleteGroups,
    // Dialog methods
    openDialog,
    deleteFromTree,
    deleteFromMobile,
    confirmDeleteAsync,
    closeDialog,
    // Constants
    trashId,
  }
})

// Legacy alias for backward compatibility
export const useDeleteDialogStore = useGroupItemsDeleteStore
