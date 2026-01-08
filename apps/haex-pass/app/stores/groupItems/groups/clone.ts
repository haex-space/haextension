import { haexPasswordsItemBinaries } from '~/database'

export interface CloneOptions {
  includeHistory: boolean
  referenceCredentials: boolean
  withCloneAppendix: boolean
}

/**
 * Store for cloning groups and items with reference resolution
 */
export const useGroupItemsCloneStore = defineStore('groupItemsCloneStore', () => {
  // Dialog state
  const showDialog = ref(false)
  const itemsToClone = ref<string[]>([])
  const targetGroupId = ref<string | null>(null)
  const cloneAppendixText = ref<string>('')
  const itemName = ref<string>('')

  /**
   * Open clone dialog for given items
   */
  const openCloneDialog = (itemIds: string[], groupId?: string | null, appendixText?: string | null, name?: string | null) => {
    itemsToClone.value = itemIds
    targetGroupId.value = groupId ?? null
    cloneAppendixText.value = appendixText ?? ''
    itemName.value = name ?? ''
    showDialog.value = true
  }

  /**
   * Close clone dialog
   */
  const closeCloneDialog = () => {
    showDialog.value = false
    itemsToClone.value = []
    targetGroupId.value = null
    cloneAppendixText.value = ''
    itemName.value = ''
  }

  /**
   * Helper function to resolve references for items, groups, and custom fields
   * Reference patterns:
   * - {REF:FIELD@ITEM:uuid} - Standard item fields
   * - {REF:FIELD@GROUP:uuid} - Group fields
   * - {REF:FIELDNAME@ITEM.EXTRA:uuid} - Custom fields (KeyValues)
   */
  const resolveReferenceAsync = async (value: string | null | undefined): Promise<string | null> => {
    if (!value) return null

    const refPattern = /\{REF:([A-Z_]+)@(ITEM|GROUP|ITEM\.EXTRA):([a-f0-9-]+)\}/i
    const match = value.match(refPattern)

    if (!match) return value // Not a reference, return as is

    const [, field, type, uuid] = match

    if (!field || !type || !uuid) return value // Invalid reference format

    const fieldUpper = field.toUpperCase()
    const typeUpper = type.toUpperCase()

    if (typeUpper === 'ITEM') {
      const { readAsync } = usePasswordItemStore()
      const referencedItem = await readAsync(uuid)

      if (!referencedItem) return value // Referenced item not found, return original value

      // Map field name to item detail property
      let fieldValue: string | null | undefined = null

      switch (fieldUpper) {
        case 'TITLE':
          fieldValue = referencedItem.details.title
          break
        case 'USERNAME':
          fieldValue = referencedItem.details.username
          break
        case 'PASSWORD':
          fieldValue = referencedItem.details.password
          break
        case 'URL':
          fieldValue = referencedItem.details.url
          break
        case 'NOTE':
        case 'NOTES':
          fieldValue = referencedItem.details.note
          break
        case 'OTP':
        case 'OTPSECRET':
        case 'OTP_SECRET':
          fieldValue = referencedItem.details.otpSecret
          break
        case 'TAGS':
          fieldValue = referencedItem.details.tags
          break
        default:
          return value // Unknown field, return original value
      }

      // Recursively resolve in case the referenced field also has a reference
      return await resolveReferenceAsync(fieldValue ?? null)
    } else if (typeUpper === 'ITEM.EXTRA') {
      const { readKeyValuesAsync } = usePasswordItemStore()
      const keyValues = await readKeyValuesAsync(uuid)

      if (!keyValues || keyValues.length === 0) return value // No custom fields found

      // Find the custom field by key name
      const customField = keyValues.find(
        (kv) => kv.key?.toUpperCase() === fieldUpper
      )

      if (!customField || !customField.value) return value // Field not found

      // Recursively resolve in case the custom field value also has a reference
      return await resolveReferenceAsync(customField.value)
    } else if (typeUpper === 'GROUP') {
      const { readGroupAsync } = usePasswordGroupStore()
      const group = await readGroupAsync(uuid)

      if (!group) return value // Referenced group not found, return original value

      // Map field name to group property
      let fieldValue: string | null | undefined = null

      switch (fieldUpper) {
        case 'NAME':
          fieldValue = group.name
          break
        case 'DESCRIPTION':
          fieldValue = group.description
          break
        case 'ICON':
          fieldValue = group.icon
          break
        case 'COLOR':
          fieldValue = group.color
          break
        default:
          return value // Unknown field, return original value
      }

      // Recursively resolve in case the referenced field also has a reference
      return await resolveReferenceAsync(fieldValue ?? null)
    }

    return value
  }

  /**
   * Clone groups and/or items to a target group
   * Options:
   * - includeHistory: Copy attachments
   * - referenceCredentials: Use references instead of copying credentials
   * - cloneAppendix: Text to append to cloned item names
   */
  const cloneGroupItemsAsync = async (
    itemIds: string[],
    targetGroupId?: string | null,
    options: {
      includeHistory?: boolean
      referenceCredentials?: boolean
      cloneAppendix?: string
    } = {}
  ) => {
    const {
      includeHistory = false,
      referenceCredentials = true,
      cloneAppendix,
    } = options

    const haexVaultStore = useHaexVaultStore()
    if (!haexVaultStore.orm) throw new Error('Database not initialized')

    const { groups, syncGroupItemsAsync, addGroupAsync } = usePasswordGroupStore()
    const { readAsync, readKeyValuesAsync, readAttachmentsAsync, addAsync } =
      usePasswordItemStore()
    const targetGroup = groups.find((group) => group.id === targetGroupId)

    for (const itemId of itemIds) {
      // Check if it's a group
      const group = groups.find((g) => g.id === itemId)

      if (group) {
        // Clone group
        const groupName = cloneAppendix
          ? `${group.name} ${cloneAppendix}`
          : group.name || ''

        await addGroupAsync({
          id: crypto.randomUUID(),
          name: groupName,
          description: group.description,
          icon: group.icon,
          color: group.color,
          parentId: targetGroupId || null,
        })
      } else {
        // Clone item
        const originalItem = await readAsync(itemId)
        const keyValues = await readKeyValuesAsync(itemId)
        const attachments = await readAttachmentsAsync(itemId)

        if (originalItem) {
          const itemTitle = cloneAppendix
            ? `${originalItem.details.title} ${cloneAppendix}`
            : originalItem.details.title || ''

          const newDetails = {
            ...originalItem.details,
            id: crypto.randomUUID(),
            title: itemTitle,
          }

          // If referenceCredentials is true, replace username and password with references
          if (referenceCredentials) {
            // New reference format: {REF:FIELD@ITEM:uuid}
            newDetails.username = `{REF:USERNAME@ITEM:${itemId}}`
            newDetails.password = `{REF:PASSWORD@ITEM:${itemId}}`
          }

          await addAsync(newDetails, keyValues || [], targetGroup)

          // Copy attachments if includeHistory is true
          if (includeHistory && attachments && attachments.length > 0) {
            for (const attachment of attachments) {
              await haexVaultStore.orm
                .insert(haexPasswordsItemBinaries)
                .values({
                  id: crypto.randomUUID(),
                  itemId: newDetails.id,
                  binaryHash: attachment.binaryHash,
                  fileName: attachment.fileName,
                })
            }
          }
        }
      }
    }

    await syncGroupItemsAsync()
  }

  /**
   * Confirm clone with options
   */
  const confirmCloneAsync = async (options: CloneOptions) => {
    if (itemsToClone.value.length === 0) return

    await cloneGroupItemsAsync(itemsToClone.value, targetGroupId.value, {
      includeHistory: options.includeHistory,
      referenceCredentials: options.referenceCredentials,
      cloneAppendix: options.withCloneAppendix ? cloneAppendixText.value : undefined,
    })

    closeCloneDialog()
  }

  return {
    // Dialog state
    showDialog,
    itemsToClone,
    targetGroupId,
    cloneAppendixText,
    itemName,
    // Dialog methods
    openCloneDialog,
    closeCloneDialog,
    confirmCloneAsync,
    // Clone functions
    cloneGroupItemsAsync,
    resolveReferenceAsync,
  }
})

// Alias for convenience
export const useCloneDialogStore = useGroupItemsCloneStore
