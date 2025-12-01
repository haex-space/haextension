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

  // Get table name for search keys
  const itemDetailsTableName = getTableName(haexPasswordsItemDetails)

  // Create Fuse instance reactively
  const searchableFuse = computed(() => {
    return new Fuse(items.value, {
      keys: [
        `${itemDetailsTableName}.title`,
        `${itemDetailsTableName}.username`,
        `${itemDetailsTableName}.url`,
      ],
      threshold: 0.3,
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
