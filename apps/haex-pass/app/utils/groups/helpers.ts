import { eq, isNull, sql } from 'drizzle-orm'
import { haexPasswordsGroups, type SelectHaexPasswordsGroups } from '~/database'

/**
 * Get groups by parent ID
 */
export const getByParentIdAsync = async (
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
export const getChildGroupsRecursiveAsync = async (
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
export const areGroupsEqual = (
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
