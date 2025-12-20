<template>
  <UiDrawerModal v-model:open="isOpen" :title="isEditMode ? t('titleEdit') : t('title')" :description="isEditMode ? t('descriptionEdit') : t('description')">
    <template #content>
      <form class="space-y-4" @submit.prevent="submitAsync">
        <!-- Backend Name -->
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

        <!-- Backend Type -->
        <div class="space-y-2">
          <ShadcnLabel>{{ t("type") }}</ShadcnLabel>
          <ShadcnSelect v-model="form.type" :disabled="isEditMode">
            <ShadcnSelectTrigger>
              <ShadcnSelectValue :placeholder="t('typePlaceholder')" />
            </ShadcnSelectTrigger>
            <ShadcnSelectContent>
              <ShadcnSelectItem value="s3">S3-compatible Storage</ShadcnSelectItem>
              <ShadcnSelectItem value="r2">Cloudflare R2</ShadcnSelectItem>
              <ShadcnSelectItem value="minio">MinIO</ShadcnSelectItem>
            </ShadcnSelectContent>
          </ShadcnSelect>
        </div>

        <!-- S3 Configuration -->
          <!-- Endpoint URL -->
          <div class="space-y-2">
            <ShadcnLabel for="endpoint">{{ t("s3.endpoint") }}</ShadcnLabel>
            <ShadcnInputGroup>
              <ShadcnInputGroupInput
                id="endpoint"
                v-model="form.s3.endpoint"
                type="url"
                :placeholder="t('s3.endpointPlaceholder')"
              />
            </ShadcnInputGroup>
          </div>

          <!-- Bucket -->
          <div class="space-y-2">
            <ShadcnLabel for="bucket">{{ t("s3.bucket") }}</ShadcnLabel>
            <ShadcnInputGroup>
              <ShadcnInputGroupInput
                id="bucket"
                v-model="form.s3.bucket"
                :placeholder="t('s3.bucketPlaceholder')"
              />
            </ShadcnInputGroup>
          </div>

          <!-- Region -->
          <div class="space-y-2">
            <ShadcnLabel for="region">{{ t("s3.region") }}</ShadcnLabel>
            <ShadcnInputGroup>
              <ShadcnInputGroupInput
                id="region"
                v-model="form.s3.region"
                :placeholder="t('s3.regionPlaceholder')"
              />
            </ShadcnInputGroup>
          </div>

          <!-- Access Key -->
          <div class="space-y-2">
            <ShadcnLabel for="accessKey">{{ t("s3.accessKey") }}</ShadcnLabel>
            <ShadcnInputGroup>
              <ShadcnInputGroupInput
                id="accessKey"
                v-model="form.s3.accessKeyId"
                :placeholder="isEditMode ? t('s3.accessKeyPlaceholderEdit') : t('s3.accessKeyPlaceholder')"
              />
            </ShadcnInputGroup>
            <p v-if="isEditMode" class="text-xs text-muted-foreground">
              {{ t("s3.credentialHint") }}
            </p>
          </div>

          <!-- Secret Key -->
          <div class="space-y-2">
            <ShadcnLabel for="secretKey">{{ t("s3.secretKey") }}</ShadcnLabel>
            <ShadcnInputGroup>
              <ShadcnInputGroupInput
                id="secretKey"
                v-model="form.s3.secretAccessKey"
                :type="showSecretKey ? 'text' : 'password'"
                :placeholder="isEditMode ? t('s3.secretKeyPlaceholderEdit') : t('s3.secretKeyPlaceholder')"
              />
              <ShadcnInputGroupButton
                :icon="showSecretKey ? EyeOff : Eye"
                variant="ghost"
                @click="showSecretKey = !showSecretKey"
              />
            </ShadcnInputGroup>
            <p v-if="isEditMode" class="text-xs text-muted-foreground">
              {{ t("s3.credentialHint") }}
            </p>
          </div>

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
import { Eye, EyeOff } from "lucide-vue-next"
import type { S3Config, StorageBackendInfo } from "~/stores/backends"

const isOpen = defineModel<boolean>("open", { default: false })

const props = defineProps<{
  editBackend?: StorageBackendInfo | null;
}>()

const emit = defineEmits<{
  saved: []
}>()

const { t } = useI18n()
const backendsStore = useBackendsStore()

const isEditMode = computed(() => !!props.editBackend)

const form = reactive({
  name: "",
  type: "s3" as "s3",
  // S3 config
  s3: {
    endpoint: "",
    bucket: "",
    region: "auto",
    accessKeyId: "",
    secretAccessKey: "",
  },
})

const showSecretKey = ref(false)
const isSubmitting = ref(false)
const error = ref<string | null>(null)

const isValid = computed(() => {
  if (!form.name.trim()) return false

  // In edit mode, credentials are optional (keep existing if not provided)
  if (isEditMode.value) {
    return !!form.s3.bucket?.trim()
  }

  return (
    !!form.s3.bucket?.trim() &&
    !!form.s3.accessKeyId?.trim() &&
    !!form.s3.secretAccessKey?.trim()
  )
})

const submitAsync = async () => {
  if (!isValid.value || isSubmitting.value) return

  isSubmitting.value = true
  error.value = null

  try {
    if (isEditMode.value && props.editBackend) {
      // Edit mode: Use update API - only send non-empty fields
      // Credentials are preserved if not provided
      const config: Partial<S3Config> = {
        endpoint: form.s3.endpoint?.trim() || undefined,
        bucket: form.s3.bucket.trim(),
        region: form.s3.region.trim() || "auto",
      }

      // Only include credentials if provided
      if (form.s3.accessKeyId.trim()) {
        config.accessKeyId = form.s3.accessKeyId.trim()
      }
      if (form.s3.secretAccessKey.trim()) {
        config.secretAccessKey = form.s3.secretAccessKey.trim()
      }

      await backendsStore.updateBackendAsync(
        props.editBackend.id,
        form.name.trim(),
        config
      )
    } else {
      // Add mode: Full config required
      const config: S3Config = {
        endpoint: form.s3.endpoint?.trim() || undefined,
        bucket: form.s3.bucket.trim(),
        region: form.s3.region.trim() || "auto",
        accessKeyId: form.s3.accessKeyId.trim(),
        secretAccessKey: form.s3.secretAccessKey.trim(),
      }
      await backendsStore.addBackendAsync(form.name.trim(), "s3", config)
    }

    emit("saved")
    resetForm()
    isOpen.value = false
  } catch (err) {
    console.error("[Backend] Error:", err)
    error.value = err instanceof Error ? err.message : t("error")
  } finally {
    isSubmitting.value = false
  }
}

const resetForm = () => {
  form.name = ""
  form.type = "s3"
  form.s3 = {
    endpoint: "",
    bucket: "",
    region: "auto",
    accessKeyId: "",
    secretAccessKey: "",
  }
  showSecretKey.value = false
  error.value = null
}

// Populate form when editing
watch(
  [isOpen, () => props.editBackend],
  ([open, editBackend]) => {
    if (!open) return

    if (editBackend) {
      // Edit mode: populate from backend info
      // Note: We can't retrieve credentials from backend (security)
      form.name = editBackend.name
      form.type = editBackend.type as "s3"
      // Populate config fields from saved config (credentials must be re-entered)
      form.s3 = {
        endpoint: editBackend.config?.endpoint || "",
        bucket: editBackend.config?.bucket || "",
        region: editBackend.config?.region || "auto",
        accessKeyId: "",
        secretAccessKey: "",
      }
    } else {
      // Add mode: reset form
      resetForm()
    }
  },
  { immediate: true }
)
</script>

<i18n lang="yaml">
de:
  title: Backend hinzufügen
  titleEdit: Backend bearbeiten
  description: Füge einen Cloud-Speicher für die Synchronisierung hinzu.
  descriptionEdit: Bearbeite die Konfiguration dieses Backends.
  name: Name
  namePlaceholder: z.B. Mein S3 Speicher
  type: Typ
  typePlaceholder: Backend-Typ auswählen
  cancel: Abbrechen
  add: Hinzufügen
  save: Speichern
  error: Ein Fehler ist aufgetreten
  s3:
    endpoint: Endpoint URL (optional)
    endpointPlaceholder: https://s3.example.com
    bucket: Bucket
    bucketPlaceholder: mein-bucket
    region: Region
    regionPlaceholder: auto
    accessKey: Access Key ID
    accessKeyPlaceholder: AKIAIOSFODNN7EXAMPLE
    accessKeyPlaceholderEdit: Neuen Access Key eingeben
    secretKey: Secret Access Key
    secretKeyPlaceholder: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
    secretKeyPlaceholderEdit: Neuen Secret Key eingeben
    credentialHint: Leer lassen, um bestehende Zugangsdaten zu behalten.

en:
  title: Add Backend
  titleEdit: Edit Backend
  description: Add a cloud storage backend for synchronization.
  descriptionEdit: Edit the configuration of this backend.
  name: Name
  namePlaceholder: e.g. My S3 Storage
  type: Type
  typePlaceholder: Select backend type
  cancel: Cancel
  add: Add
  save: Save
  error: An error occurred
  s3:
    endpoint: Endpoint URL (optional)
    endpointPlaceholder: https://s3.example.com
    bucket: Bucket
    bucketPlaceholder: my-bucket
    region: Region
    regionPlaceholder: auto
    accessKey: Access Key ID
    accessKeyPlaceholder: AKIAIOSFODNN7EXAMPLE
    accessKeyPlaceholderEdit: Enter new access key
    secretKey: Secret Access Key
    secretKeyPlaceholder: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
    secretKeyPlaceholderEdit: Enter new secret key
    credentialHint: Leave empty to keep existing credentials.
</i18n>
