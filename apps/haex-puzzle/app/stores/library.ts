import { tableName } from '~/database/schemas'
import { createLibrary, type Library, type LibraryFile } from '~/lib/library'
import { encodePicture } from '~/lib/pictureEncode'
import { createVaultBackend } from '~/lib/vaultBackend'
import type { AddResult, LibraryItem } from '~/types/puzzle'

/** The picture library: reactive list around `createLibrary`; the one place that picks the backend. */
export const useLibraryStore = defineStore('library', () => {
  const items = ref<LibraryItem[]>([])
  const loading = ref(false)
  /** Pictures that could not be opened any more; shown as unusable, still removable. */
  const unusable = ref<Set<string>>(new Set())
  let library: Library | null = null

  async function getLibrary(): Promise<Library> {
    if (library) return library
    if (useStandalone()) {
      // Never ships: `import.meta.dev` is false in a release build, so the branch and the import are dropped.
      const { createMemoryBackend } = await import('~/lib/memoryBackend.testing')
      library = createLibrary(createMemoryBackend(), encodePicture)
    } else {
      // Created here, not up front: without the host the vault store cannot be created at all.
      const vault = useHaexVaultStore()
      await vault.initializeAsync()
      library = createLibrary(createVaultBackend(vault.client.database, tableName('pictures')), encodePicture)
    }
    return library
  }

  async function load(): Promise<void> {
    loading.value = true
    try {
      items.value = await (await getLibrary()).list()
    } finally {
      loading.value = false
    }
  }

  async function add(files: readonly LibraryFile[]): Promise<AddResult[]> {
    const lib = await getLibrary()
    const results = await lib.add(files)
    if (results.some(result => result.ok && !result.duplicate)) items.value = await lib.list()
    return results
  }

  async function open(id: string) {
    try {
      return await (await getLibrary()).open(id)
    } catch (error) {
      unusable.value = new Set(unusable.value).add(id)
      throw error
    }
  }

  /** All or nothing: when the vault refuses, this rejects and `items` is unchanged. */
  async function remove(ids: readonly string[]): Promise<void> {
    await (await getLibrary()).remove(ids)
    const gone = new Set(ids)
    items.value = items.value.filter(item => !gone.has(item.id))
    unusable.value = new Set([...unusable.value].filter(id => !gone.has(id)))
  }

  return { items, loading, unusable, load, add, open, remove }
})
