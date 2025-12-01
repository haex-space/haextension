import type { SelectHaexPasswordsGroups } from '~/database'
import { trashId } from './delete'

/**
 * Store for tree-related group logic
 * Handles breadcrumbs, parent chains, and trash detection
 */
export const useGroupTreeStore = defineStore('groupTreeStore', () => {
  const { groups, currentGroupId } = storeToRefs(usePasswordGroupStore())

  /**
   * Get the parent chain for a group (used for breadcrumbs)
   */
  const getParentChain = (
    groupId?: string | null,
    chain: SelectHaexPasswordsGroups[] = []
  ): SelectHaexPasswordsGroups[] => {
    const group = groups.value.find((group) => group.id === groupId)
    if (group) {
      chain.unshift(group)
      return getParentChain(group.parentId, chain)
    }
    return chain
  }

  /**
   * Breadcrumbs for the current group
   */
  const breadCrumbs = computed(() => getParentChain(currentGroupId.value))

  /**
   * Check if a group is in the trash (or is trash itself)
   */
  const isGroupInTrash = (groupId: string): boolean => {
    if (groupId === trashId) return true
    const parentChain = getParentChain(groupId)
    return parentChain.some((item) => item.id === trashId)
  }

  /**
   * Check if the current group is in trash
   */
  const inTrashGroup = computed(() =>
    breadCrumbs.value?.some((item) => item.id === trashId)
  )

  return {
    breadCrumbs,
    getParentChain,
    isGroupInTrash,
    inTrashGroup,
  }
})
