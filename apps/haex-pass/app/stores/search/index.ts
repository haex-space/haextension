import { useDebounceFn } from '@vueuse/core'
import Fuse from 'fuse.js'
import { getTableName } from 'drizzle-orm'
import { haexPasswordsItemDetails } from '~/database'

export const useSearchStore = defineStore('searchStore', () => {
  const searchInput = ref<string>('')
  const search = ref<string>('')

  // Debounce the search to avoid blocking the UI
  const updateSearch = useDebounceFn((value: string) => {
    search.value = value
  }, 300)

  // Watch searchInput and update search with debounce
  watch(searchInput, (newValue) => {
    updateSearch(newValue)
  })

  // Get items from password store
  const { items } = storeToRefs(usePasswordItemStore())

  // Get tag data for enriching search
  const { itemTagLinks, tags } = storeToRefs(useTagStore())

  // Get table name for search keys
  const itemDetailsTableName = getTableName(haexPasswordsItemDetails)

  // Map tagId → tagName for fast lookup
  const tagNameMap = computed(() => {
    const m = new Map<string, string>()
    for (const tag of tags.value) m.set(tag.id, tag.name)
    return m
  })

  // Map itemId → tag names array
  const itemTagNamesMap = computed(() => {
    const m = new Map<string, string[]>()
    for (const link of itemTagLinks.value) {
      const name = tagNameMap.value.get(link.tagId)
      if (!name) continue
      const arr = m.get(link.itemId) ?? []
      arr.push(name)
      m.set(link.itemId, arr)
    }
    return m
  })

  // Create Fuse instance reactively, enriching items with their tag names
  const searchableFuse = computed(() => {
    const enrichedItems = items.value.map((item) => {
      const details = (item as Record<string, Record<string, unknown>>)[itemDetailsTableName]
      const itemId = details?.id as string
      return { ...item, __tagNames: itemTagNamesMap.value.get(itemId) ?? [] }
    })

    return new Fuse(enrichedItems, {
      keys: [
        `${itemDetailsTableName}.title`,
        `${itemDetailsTableName}.username`,
        `${itemDetailsTableName}.url`,
        `${itemDetailsTableName}.note`,
        '__tagNames',
      ],
      threshold: 0.2,
      ignoreLocation: true,
      shouldSort: true,
      minMatchCharLength: 2,
    })
  })

  // Computed search results
  const searchResults = computed(() => {
    if (!search.value) return null
    if (search.value.length < 2) return []

    return searchableFuse.value.search(search.value, { limit: 50 }).map((match) => match.item)
  })

  return {
    search,
    searchInput,
    searchResults,
  }
})
