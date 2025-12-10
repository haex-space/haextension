import { ref, watch } from 'vue'
import type { Ref } from 'vue'

/**
 * Simple web extension storage composable
 */
export function useWebExtensionStorage<T>(
  key: string,
  initialValue: T,
): { data: Ref<T>, dataReady: Promise<T> } {
  const data = ref(initialValue) as Ref<T>

  const dataReadyPromise = new Promise<T>((resolve) => {
    browser.storage.local.get(key).then((result) => {
      if (result[key] !== undefined) {
        data.value = result[key] as T
      }
      resolve(data.value)
    })
  })

  watch(data, (newValue) => {
    browser.storage.local.set({ [key]: newValue })
  }, { deep: true })

  // Listen for changes from other contexts
  browser.storage.onChanged.addListener((changes) => {
    if (changes[key]) {
      data.value = changes[key].newValue as T
    }
  })

  return {
    data,
    dataReady: dataReadyPromise,
  }
}
