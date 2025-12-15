import { onBeforeRouteLeave } from 'vue-router'

interface UseUnsavedChangesGuardOptions {
  hasChanges: Ref<boolean> | ComputedRef<boolean>
  ignoreChanges: Ref<boolean>
  showDialog: Ref<boolean>
  additionalDialogs?: Ref<boolean>[]
}

export function useUnsavedChangesGuard(options: UseUnsavedChangesGuardOptions) {
  const { hasChanges, ignoreChanges, showDialog, additionalDialogs = [] } = options

  onBeforeRouteLeave((_to, _from, next) => {
    // Allow navigation if any dialog is open
    if (showDialog.value || additionalDialogs.some(d => d.value)) {
      next()
      return
    }

    // Allow navigation if changes were already confirmed to be discarded
    if (ignoreChanges.value) {
      next()
      return
    }

    // Show unsaved changes dialog if there are changes
    if (hasChanges.value) {
      showDialog.value = true
      next(false)
      return
    }

    next()
  })
}
