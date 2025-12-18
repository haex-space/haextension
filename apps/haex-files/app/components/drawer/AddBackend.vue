<template>
  <UiDrawerModal v-model:open="isOpen" :title="t('title')" :description="t('description')">
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
          <ShadcnSelect v-model="form.type">
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
                :placeholder="t('s3.accessKeyPlaceholder')"
              />
            </ShadcnInputGroup>
          </div>

          <!-- Secret Key -->
          <div class="space-y-2">
            <ShadcnLabel for="secretKey">{{ t("s3.secretKey") }}</ShadcnLabel>
            <ShadcnInputGroup>
              <ShadcnInputGroupInput
                id="secretKey"
                v-model="form.s3.secretAccessKey"
                :type="showSecretKey ? 'text' : 'password'"
                :placeholder="t('s3.secretKeyPlaceholder')"
              />
              <ShadcnInputGroupButton
                :icon="showSecretKey ? EyeOff : Eye"
                variant="ghost"
                @click="showSecretKey = !showSecretKey"
              />
            </ShadcnInputGroup>
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
          {{ t("add") }}
        </ShadcnButton>
      </div>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
import { Eye, EyeOff } from "lucide-vue-next"
import type { StorageBackendType, BackendConfig } from "@haex-space/vault-sdk"

const isOpen = defineModel<boolean>("open", { default: false })
const { t } = useI18n()
const backendsStore = useBackendsStore()

const form = reactive({
  name: "",
  type: "s3" as StorageBackendType,
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
    const config: BackendConfig = {
      type: form.type as "s3" | "r2" | "minio",
      endpoint: form.s3.endpoint?.trim() || undefined,
      bucket: form.s3.bucket.trim(),
      region: form.s3.region.trim() || "auto",
      accessKeyId: form.s3.accessKeyId.trim(),
      secretAccessKey: form.s3.secretAccessKey.trim(),
    }

    await backendsStore.addBackendAsync(form.name.trim(), config)

    // Reset form and close
    resetForm()
    isOpen.value = false
  } catch (err) {
    console.error("[AddBackend] Error:", err)
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

// Reset form when drawer closes
watch(isOpen, (newValue) => {
  if (!newValue) {
    resetForm()
  }
})
</script>

<i18n lang="yaml">
de:
  title: Backend hinzufügen
  description: Füge einen Cloud-Speicher für die Synchronisierung hinzu.
  name: Name
  namePlaceholder: z.B. Mein S3 Speicher
  type: Typ
  typePlaceholder: Backend-Typ auswählen
  cancel: Abbrechen
  add: Hinzufügen
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
    secretKey: Secret Access Key
    secretKeyPlaceholder: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

en:
  title: Add Backend
  description: Add a cloud storage backend for synchronization.
  name: Name
  namePlaceholder: e.g. My S3 Storage
  type: Type
  typePlaceholder: Select backend type
  cancel: Cancel
  add: Add
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
    secretKey: Secret Access Key
    secretKeyPlaceholder: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
</i18n>
