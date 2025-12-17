import { eq, isNull, sql } from 'drizzle-orm'
import {
  haexPasswordsGroupItems,
  haexPasswordsGroups,
  type InsertHaexPasswordsGroups,
  type SelectHaexPasswordsGroupItems,
  type SelectHaexPasswordsGroups,
  type SelectHaexPasswordsItemDetails,
} from '~/database'
import { getSingleRouteParam } from '~/utils/helper'
import { usePasswordItemStore } from '../items'

export const trashId = 'trash'

interface CachedItemDetails {
  details: SelectHaexPasswordsItemDetails
  resolvedPassword: string | null
  resolvedUsername: string | null
}

/**
 * Core store for password groups - handles CRUD operations and state
 */
export const usePasswordGroupStore = defineStore('passwordGroupStore', () => {
  // === State ===
  const groups = ref<SelectHaexPasswordsGroups[]>([])

  const currentGroupId = computed<string | null | undefined>({
    get: () =>
      getSingleRouteParam(useRouter().currentRoute.value.params.groupId) ||
      undefined,
    set: (newGroupId) => {
      useRouter().currentRoute.value.params.groupId = newGroupId ?? ''
    },
  })

  const currentGroup = ref<SelectHaexPasswordsGroups | null>(null)
  const currentGroupItems = ref<Map<string, CachedItemDetails>>(new Map())
  const isLoadingGroupItems = ref(false)

  /**
   * Load all item details for the current group with resolved references
   */
  const loadCurrentGroupItemsAsync = async () => {
    const haexVaultStore = useHaexVaultStore()
    if (!haexVaultStore.orm) {
      currentGroupItems.value.clear()
      return
    }

    isLoadingGroupItems.value = true

    try {
      const { readByGroupIdAsync } = usePasswordItemStore()
      const { resolveReferenceAsync } = useGroupItemsCloneStore()

      // Get all item details in this group (null = root)
      const itemDetails = await readByGroupIdAsync(currentGroupId.value)

      if (!itemDetails || itemDetails.length === 0) {
        currentGroupItems.value.clear()
        return
      }

      // Resolve references for all items in parallel
      const resolvedItems = await Promise.all(
        itemDetails.map(async (details) => {
          const resolvedPassword = details.password
            ? await resolveReferenceAsync(details.password)
            : null
          const resolvedUsername = details.username
            ? await resolveReferenceAsync(details.username)
            : null

          return {
            id: details.id,
            details,
            resolvedPassword,
            resolvedUsername,
          }
        })
      )

      // Update cache
      const newCache = new Map<string, CachedItemDetails>()
      for (const item of resolvedItems) {
        newCache.set(item.id, {
          details: item.details,
          resolvedPassword: item.resolvedPassword,
          resolvedUsername: item.resolvedUsername,
        })
      }
      currentGroupItems.value = newCache
    } finally {
      isLoadingGroupItems.value = false
    }
  }

  // Watch currentGroupId and update currentGroup
  watch(
    currentGroupId,
    async (newId) => {
      if (newId) {
        currentGroup.value = await readGroupAsync(newId)
      } else {
        currentGroup.value = null
      }
      // Load all item details for this group (including root)
      await loadCurrentGroupItemsAsync()
    },
    { immediate: true }
  )

  // === Sync and Initialization ===

  /**
   * Sync groups and items from database
   */
  const syncGroupItemsAsync = async () => {
    const haexVaultStore = useHaexVaultStore()

    // Wait for database to be initialized
    if (!haexVaultStore.orm) {
      return
    }

    const { syncItemsAsync } = usePasswordItemStore()

    groups.value = (await readGroupsAsync()) ?? []

    await syncItemsAsync()
  }

  /**
   * Auto-navigate to single folder in root
   * If there's only one folder (excluding trash) in root, navigate directly into it
   */
  const autoNavigateToSingleFolderAsync = async () => {
    // Only auto-navigate when we're at root level
    if (currentGroupId.value !== null) return

    // Get root-level groups (excluding trash)
    const rootGroups = groups.value.filter(
      (group) => group.parentId === null && group.id !== trashId
    )

    // If exactly one folder exists, navigate into it
    if (rootGroups.length === 1 && rootGroups[0]) {
      await navigateTo(
        useLocalePath()({
          name: 'passwordGroupItems',
          params: { groupId: rootGroups[0].id },
        })
      )
    }
  }

  // Watch for haexhub setup completion AND orm initialization, then sync
  const haexVaultStore = useHaexVaultStore()
  watch(() => ({ isSetupComplete: haexVaultStore.state.isSetupComplete, orm: haexVaultStore.orm }), async ({ isSetupComplete, orm }) => {
    if (isSetupComplete && orm) {
      await syncGroupItemsAsync()
      // After initial sync, check if we should auto-navigate
      await autoNavigateToSingleFolderAsync()
    }
  }, { immediate: true })

  // === CRUD Operations ===

  /**
   * Add a new group
   */
  const addGroupAsync = async (group: Partial<InsertHaexPasswordsGroups>) => {
    const haexVaultStore = useHaexVaultStore()
    if (!haexVaultStore.orm) throw new Error('Database not initialized')

    const newGroup: InsertHaexPasswordsGroups = {
      id: group.id || crypto.randomUUID(),
      parentId: group.parentId,
      color: group.color,
      icon: group.icon,
      name: group.name,
      order: group.order,
    }

    await haexVaultStore.orm.insert(haexPasswordsGroups).values(newGroup)

    return newGroup
  }

  /**
   * Read a single group by ID
   */
  const readGroupAsync = async (groupId: string) => {
    const haexVaultStore = useHaexVaultStore()
    if (!haexVaultStore.orm) throw new Error('Database not initialized')

    const result = await haexVaultStore.orm
      .select()
      .from(haexPasswordsGroups)
      .where(eq(haexPasswordsGroups.id, groupId))
      .limit(1)

    return result[0] || null
  }

  /**
   * Read all groups or filter by parentId
   */
  const readGroupsAsync = async (filter?: { parentId?: string | null }) => {
    const haexVaultStore = useHaexVaultStore()
    if (!haexVaultStore.orm) throw new Error('Database not initialized')

    let query
    if (filter?.parentId) {
      query = haexVaultStore.orm
        .select()
        .from(haexPasswordsGroups)
        .where(eq(haexPasswordsGroups.parentId, filter.parentId))
        .orderBy(sql`${haexPasswordsGroups.order} nulls last`)
    } else {
      query = haexVaultStore.orm
        .select()
        .from(haexPasswordsGroups)
        .orderBy(sql`${haexPasswordsGroups.order} nulls last`)
    }

    return await query
  }

  /**
   * Read all group items for a group
   */
  const readGroupItemsAsync = async (
    groupId?: string | null
  ): Promise<SelectHaexPasswordsGroupItems[]> => {
    const haexVaultStore = useHaexVaultStore()
    if (!haexVaultStore.orm) throw new Error('Database not initialized')

    if (groupId) {
      return await haexVaultStore.orm
        .select()
        .from(haexPasswordsGroupItems)
        .where(eq(haexPasswordsGroupItems.groupId, groupId))
    } else {
      return await haexVaultStore.orm
        .select()
        .from(haexPasswordsGroupItems)
        .where(isNull(haexPasswordsGroupItems.groupId))
    }
  }

  /**
   * Update a group
   */
  const updateAsync = async (group: InsertHaexPasswordsGroups) => {
    const haexVaultStore = useHaexVaultStore()
    if (!haexVaultStore.orm) throw new Error('Database not initialized')
    if (!group.id) return

    // Don't include id in the SET clause - only use it in WHERE
    const updateData = {
      color: group.color,
      description: group.description,
      icon: group.icon,
      name: group.name,
      order: group.order,
      parentId: group.parentId,
    }

    return await haexVaultStore.orm
      .update(haexPasswordsGroups)
      .set(updateData)
      .where(eq(haexPasswordsGroups.id, group.id))
  }

  /**
   * Update only the parentId of a group (for moving to trash or reordering)
   */
  const updateParentAsync = async (groupId: string, parentId: string | null) => {
    const haexVaultStore = useHaexVaultStore()
    if (!haexVaultStore.orm) throw new Error('Database not initialized')

    return await haexVaultStore.orm
      .update(haexPasswordsGroups)
      .set({ parentId })
      .where(eq(haexPasswordsGroups.id, groupId))
  }

  // === Helper Functions ===

  /**
   * Get groups by parent ID
   */
  const getByParentIdAsync = async (
    parentId?: string | null
  ): Promise<SelectHaexPasswordsGroups[]> => {
    try {
      const haexVaultStore = useHaexVaultStore()
      if (!haexVaultStore.orm) throw new Error('Database not initialized')

      if (parentId) {
        return await haexVaultStore.orm
          .select()
          .from(haexPasswordsGroups)
          .where(eq(haexPasswordsGroups.parentId, parentId))
          .orderBy(sql`${haexPasswordsGroups.order} nulls last`)
      } else {
        return await haexVaultStore.orm
          .select()
          .from(haexPasswordsGroups)
          .where(isNull(haexPasswordsGroups.parentId))
          .orderBy(sql`${haexPasswordsGroups.order} nulls last`)
      }
    } catch (error) {
      console.error(error)
      return []
    }
  }

  /**
   * Get all child groups recursively
   */
  const getChildGroupsRecursiveAsync = async (
    groupId: string,
    groups: SelectHaexPasswordsGroups[] = []
  ) => {
    const childGroups = (await getByParentIdAsync(groupId)) ?? []
    for (const child of childGroups) {
      groups.push(child)  // Add the child itself
      await getChildGroupsRecursiveAsync(child.id, groups)  // Recursively add its children
    }

    return groups
  }

  /**
   * Compare two groups or group arrays for equality
   */
  const areGroupsEqual = (
    groupA: unknown | unknown[] | null,
    groupB: unknown | unknown[] | null
  ) => {
    if (groupA === null && groupB === null) return true

    if (Array.isArray(groupA) && Array.isArray(groupB)) {
      if (groupA.length === groupB.length) return true

      return groupA.some((group: unknown, index: number) => {
        return areObjectsEqual(group, groupA[index])
      })
    }
    return areObjectsEqual(groupA, groupB)
  }

  // === Navigation ===

  /**
   * Navigate to a group's edit page
   */
  const navigateToGroupAsync = (groupId?: string | null) =>
    navigateTo(
      useLocaleRoute()({
        name: 'passwordGroupEdit',
        params: {
          groupId,
        },
        query: {
          ...useRouter().currentRoute.value.query,
        },
      })
    )

  /**
   * Navigate to a group's items page
   */
  const navigateToGroupItemsAsync = (groupId: string) => {
    return navigateTo(
      useLocaleRoute()({
        name: 'passwordGroupItems',
        params: {
          groupId,
        },
        query: {
          ...useRouter().currentRoute.value.query,
        },
      })
    )
  }

  /**
   * Restore a group from trash to a target parent group
   * Falls back to root if target parent doesn't exist or is in trash
   */
  const restoreGroupAsync = async (groupId: string, targetParentId: string | null = null) => {
    const haexVaultStore = useHaexVaultStore()
    if (!haexVaultStore.orm) throw new Error('Database not initialized')

    const { isGroupInTrash } = useGroupTreeStore()

    // If a target parent is specified, verify it exists and is not in trash
    let finalParentId: string | null = null
    if (targetParentId) {
      const targetParent = await readGroupAsync(targetParentId)
      // Only use target if it exists and is not in trash
      if (targetParent && !isGroupInTrash(targetParentId)) {
        finalParentId = targetParentId
      }
    }

    await haexVaultStore.orm
      .update(haexPasswordsGroups)
      .set({ parentId: finalParentId })
      .where(eq(haexPasswordsGroups.id, groupId))
  }

  return {
    // State
    groups,
    currentGroupId,
    currentGroup,
    currentGroupItems,
    isLoadingGroupItems,
    // Sync
    syncGroupItemsAsync,
    loadCurrentGroupItemsAsync,
    // CRUD
    addGroupAsync,
    readGroupAsync,
    readGroupsAsync,
    readGroupItemsAsync,
    updateAsync,
    updateParentAsync,
    restoreGroupAsync,
    // Helpers
    getChildGroupsRecursiveAsync,
    areGroupsEqual,
    // Navigation
    navigateToGroupAsync,
    navigateToGroupItemsAsync,
    // Constants
    trashId,
  }
})

// Helper function for object comparison
function areObjectsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (a === null || b === null) return false

  const keysA = Object.keys(a as Record<string, unknown>)
  const keysB = Object.keys(b as Record<string, unknown>)

  if (keysA.length !== keysB.length) return false

  return keysA.every((key) => {
    const valA = (a as Record<string, unknown>)[key]
    const valB = (b as Record<string, unknown>)[key]
    return valA === valB
  })
}
