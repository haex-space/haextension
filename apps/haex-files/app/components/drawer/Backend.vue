<template>
  <UiDrawerModal v-model:open="isOpen" :title="isEditMode ? t('titleEdit') : t('title')" :description="isEditMode ? t('descriptionEdit') : t('description')">
    <template #content>
      <form class="space-y-4" @submit.prevent="submitAsync">
        <!-- Name -->
        <div class="space-y-2">
          <ShadcnLabel for="name">{{ t("name") }}</ShadcnLabel>
          <ShadcnInputGroup>
            <ShadcnInputGroupInput
              id="name"
              v-model="form.name"
              :placeholder="t('namePlaceholder')"
              autofocus
            />
          </ShadcnInputGroup>
        </div>

        <!-- Provider: a known one (only the bucket is new) or a new connection -->
        <div v-if="!isEditMode" class="space-y-2">
          <ShadcnLabel>{{ t("provider") }}</ShadcnLabel>
          <ShadcnSelect v-model="form.provider">
            <ShadcnSelectTrigger>
              <ShadcnSelectValue />
            </ShadcnSelectTrigger>
            <ShadcnSelectContent>
              <ShadcnSelectItem
                v-for="known in knownProviders"
                :key="known.backendId"
                :value="known.backendId"
              >
                {{ known.providerName }}
              </ShadcnSelectItem>
              <ShadcnSelectItem :value="NEW_PROVIDER">{{ t("newProvider") }}</ShadcnSelectItem>
            </ShadcnSelectContent>
          </ShadcnSelect>
        </div>

        <template v-if="!isEditMode && form.provider === NEW_PROVIDER">
          <!-- Endpoint URL -->
          <div class="space-y-2">
            <ShadcnLabel for="endpoint">{{ t("s3.endpoint") }}</ShadcnLabel>
            <ShadcnInputGroup>
              <ShadcnInputGroupInput
                id="endpoint"
                v-model="form.endpoint"
                type="url"
                :placeholder="t('s3.endpointPlaceholder')"
              />
            </ShadcnInputGroup>
            <p class="text-xs text-muted-foreground">{{ t("s3.endpointHint") }}</p>
          </div>

          <!-- Region -->
          <div class="space-y-2">
            <ShadcnLabel for="region">{{ t("s3.region") }}</ShadcnLabel>
            <ShadcnInputGroup>
              <ShadcnInputGroupInput
                id="region"
                v-model="form.region"
                :placeholder="t('s3.regionPlaceholder')"
              />
            </ShadcnInputGroup>
          </div>
        </template>

        <!-- Bucket -->
        <div class="space-y-2">
          <ShadcnLabel for="bucket">{{ t("s3.bucket") }}</ShadcnLabel>
          <ShadcnInputGroup>
            <ShadcnInputGroupInput
              id="bucket"
              v-model="form.bucket"
              :placeholder="t('s3.bucketPlaceholder')"
            />
          </ShadcnInputGroup>
        </div>

        <!-- Credentials are never typed here -->
        <p class="p-3 rounded-md bg-muted text-xs text-muted-foreground">
          {{ isEditMode ? t("hostHintEdit") : t("hostHint") }}
        </p>

        <!-- Error -->
        <div
          v-if="error"
          class="p-3 bg-destructive/10 text-destructive rounded-md text-sm"
        >
          {{ error }}
        </div>
      </form>
    </template>

    <template #footer>
      <div class="flex gap-2 w-full sm:justify-end">
        <ShadcnButton
          variant="outline"
          class="flex-1 sm:flex-none"
          @click="isOpen = false"
        >
          {{ t("cancel") }}
        </ShadcnButton>
        <ShadcnButton
          :disabled="!isValid"
          :loading="isSubmitting"
          class="flex-1 sm:flex-none"
          @click="submitAsync"
        >
          {{ isEditMode ? t("save") : t("add") }}
        </ShadcnButton>
      </div>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
import { storageFailure, type StorageBackendInfo } from "~/stores/backends"

const NEW_PROVIDER = "new"

const isOpen = defineModel<boolean>("open", { default: false })

const props = defineProps<{
  editBackend?: StorageBackendInfo | null;
}>()

const emit = defineEmits<{
  saved: []
}>()

const { t } = useI18n()
const backendsStore = useBackendsStore()
const { backends } = storeToRefs(backendsStore)

const isEditMode = computed(() => !!props.editBackend)

/** One entry per provider this extension already reaches: a new bucket there needs no new credentials. */
const knownProviders = computed(() => {
  const seen = new Map<string, { backendId: string; providerName: string }>()
  for (const backend of backends.value) {
    if (!seen.has(backend.providerName)) {
      seen.set(backend.providerName, { backendId: backend.id, providerName: backend.providerName })
    }
  }
  return [...seen.values()]
})

const form = reactive({
  name: "",
  provider: NEW_PROVIDER,
  endpoint: "",
  region: "",
  bucket: "",
})

const isSubmitting = ref(false)
const error = ref<string | null>(null)

const isValid = computed(() => {
  if (!form.name.trim() || !form.bucket.trim()) return false
  if (isEditMode.value || form.provider !== NEW_PROVIDER) return true
  return !!form.region.trim()
})

const submitAsync = async () => {
  if (!isValid.value || isSubmitting.value) return

  isSubmitting.value = true
  error.value = null

  try {
    if (isEditMode.value && props.editBackend) {
      await backendsStore.updateBackendAsync(props.editBackend.id, form.name.trim(), form.bucket.trim())
    } else if (form.provider !== NEW_PROVIDER) {
      await backendsStore.addOnSameProviderAsync(form.name.trim(), form.provider, form.bucket.trim())
    } else {
      await backendsStore.addBackendAsync(form.name.trim(), {
        endpoint: form.endpoint.trim() || undefined,
        region: form.region.trim(),
        bucket: form.bucket.trim(),
      })
    }

    emit("saved")
    resetForm()
    isOpen.value = false
  } catch (err) {
    console.error("[Backend] Error:", err)
    const failure = storageFailure(err)
    error.value = failure.kind === "other" ? failure.message : t(`errors.${failure.kind}`)
  } finally {
    isSubmitting.value = false
  }
}

const resetForm = () => {
  form.name = ""
  form.provider = knownProviders.value[0]?.backendId ?? NEW_PROVIDER
  form.endpoint = ""
  form.region = ""
  form.bucket = ""
  error.value = null
}

// Populate form when editing
watch(
  [isOpen, () => props.editBackend],
  ([open, editBackend]) => {
    if (!open) return

    resetForm()
    if (editBackend) {
      form.name = editBackend.name
      form.bucket = editBackend.bucket
    }
  },
  { immediate: true }
)
</script>

<i18n lang="yaml">
de:
  title: Speicher hinzufügen
  titleEdit: Speicher bearbeiten
  description: Füge einen Speicher für die Synchronisierung hinzu.
  descriptionEdit: Ändere Name oder Bucket dieses Speichers.
  name: Name
  namePlaceholder: z.B. Fotos
  provider: Anbieter
  newProvider: Neuer Anbieter …
  cancel: Abbrechen
  add: Hinzufügen
  save: Speichern
  hostHint: holzi fragt dich in einem eigenen Fenster, ob du den Speicher anlegen willst, und dort auch nach den Zugangsdaten. Diese Erweiterung bekommt sie nie zu sehen.
  hostHintEdit: holzi fragt dich in einem eigenen Fenster, ob du die Änderung bestätigst. Neue Zugangsdaten gibst du dort ein.
  s3:
    endpoint: Endpunkt (optional)
    endpointPlaceholder: https://s3.example.com
    endpointHint: Leer lassen für AWS S3.
    bucket: Bucket
    bucketPlaceholder: mein-bucket
    region: Region
    regionPlaceholder: z.B. us-east-1
  errors:
    cancelled: In holzi abgebrochen oder nicht erlaubt.
    accessDenied: Zugang verweigert.
    network: Der Anbieter ist nicht erreichbar.
    bucketMissing: Den Bucket gibt es beim Anbieter nicht.

en:
  title: Add storage
  titleEdit: Edit storage
  description: Add a storage for synchronization.
  descriptionEdit: Change the name or bucket of this storage.
  name: Name
  namePlaceholder: e.g. Photos
  provider: Provider
  newProvider: New provider …
  cancel: Cancel
  add: Add
  save: Save
  hostHint: holzi asks in its own window whether to add the storage, and asks for the credentials there too. This extension never sees them.
  hostHintEdit: holzi asks in its own window to confirm the change. New credentials are entered there.
  s3:
    endpoint: Endpoint (optional)
    endpointPlaceholder: https://s3.example.com
    endpointHint: Leave empty for AWS S3.
    bucket: Bucket
    bucketPlaceholder: my-bucket
    region: Region
    regionPlaceholder: e.g. us-east-1
  errors:
    cancelled: Cancelled in holzi or not allowed.
    accessDenied: Access denied.
    network: The provider is not reachable.
    bucketMissing: The bucket does not exist at the provider.
</i18n>
