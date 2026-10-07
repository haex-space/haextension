<template>
  <div class="h-screen flex flex-col">
    <!-- Header -->
    <header
      class="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-sm px-4 py-3"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <ShadcnButton variant="ghost" size="icon" @click="navigateBack">
            <ArrowLeft class="size-5" />
          </ShadcnButton>
          <h1 class="text-lg font-semibold">{{ t("title") }}</h1>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1 overflow-auto p-4">
      <div class="max-w-2xl mx-auto space-y-6">
        <!-- Storage Backends Section -->
        <section class="space-y-4">
          <div class="flex items-center justify-between gap-4">
            <div class="min-w-0">
              <h2 class="text-base font-medium">{{ t("backends.title") }}</h2>
              <p class="text-sm text-muted-foreground">
                {{ t("backends.description") }}
              </p>
            </div>
            <ShadcnButton :prepend-icon="Plus" @click="openAddBackendDrawer">
              {{ t("backends.add") }}
            </ShadcnButton>
          </div>

          <p v-if="failure" class="text-sm text-destructive">{{ failure }}</p>

          <!-- Backend List -->
          <div v-if="backends.length > 0" class="space-y-2">
            <div
              v-for="backend in backends"
              :key="backend.id"
              class="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
            >
              <div
                class="size-10 rounded-lg bg-primary/10 flex items-center justify-center"
              >
                <Cloud class="size-5 text-primary" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate">{{ backend.name }}</div>
                <div class="text-sm text-muted-foreground truncate">
                  {{ backend.providerName }} · {{ backend.bucket }}
                </div>
                <div
                  v-if="testFailure(backend.id)"
                  class="text-xs text-destructive"
                >
                  {{ testFailure(backend.id) }}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <ShadcnButton
                  variant="ghost"
                  size="icon"
                  :loading="testingBackendId === backend.id"
                  :tooltip="t('backends.test')"
                  @click="testBackendAsync(backend.id)"
                >
                  <component
                    :is="getTestResultIcon(backend.id)"
                    :class="getTestResultClass(backend.id)"
                    class="size-4"
                  />
                </ShadcnButton>
                <ShadcnButton
                  variant="ghost"
                  size="icon"
                  :tooltip="t('backends.edit')"
                  @click="openEditBackendDrawer(backend)"
                >
                  <Pencil class="size-4" />
                </ShadcnButton>
                <ShadcnButton
                  variant="ghost"
                  size="icon"
                  :tooltip="t('backends.remove')"
                  @click="removeBackendAsync(backend)"
                >
                  <Trash2 class="size-4 text-destructive" />
                </ShadcnButton>
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div
            v-else
            class="text-center py-8 border border-dashed border-border rounded-lg"
          >
            <Cloud class="size-8 text-muted-foreground mx-auto mb-2" />
            <p class="text-sm text-muted-foreground">
              {{ t("backends.empty") }}
            </p>
          </div>
        </section>
      </div>
    </main>

    <!-- Add/Edit Backend Drawer/Modal -->
    <DrawerBackend
      v-model:open="addBackendDrawerOpen"
      :edit-backend="editingBackend"
      @saved="editingBackend = null"
    />

  </div>
</template>

<script setup lang="ts">
import {
  ArrowLeft,
  Plus,
  Cloud,
  Trash2,
  Check,
  X,
  Loader2,
  Zap,
  Pencil,
} from "@lucide/vue";
import { storageFailure, type StorageBackendInfo } from "~/stores/backends";

const { t } = useI18n();
const router = useRouter();
const backendsStore = useBackendsStore();

const { backends, testingBackendId, testResult } = storeToRefs(backendsStore);

const addBackendDrawerOpen = ref(false);
const editingBackend = ref<StorageBackendInfo | null>(null);
const failure = ref<string | null>(null);

// Load backends on mount
onMounted(async () => {
  await backendsStore.loadBackendsAsync();
});

const navigateBack = () => {
  router.push("/");
};

const openAddBackendDrawer = () => {
  editingBackend.value = null;
  addBackendDrawerOpen.value = true;
};

const openEditBackendDrawer = (backend: StorageBackendInfo) => {
  editingBackend.value = backend;
  addBackendDrawerOpen.value = true;
};

const testBackendAsync = async (backendId: string) => {
  await backendsStore.testBackendAsync(backendId);
};

const getTestResultIcon = (backendId: string) => {
  if (testingBackendId.value === backendId) {
    return Loader2;
  }
  if (testResult.value?.backendId === backendId) {
    return testResult.value.success ? Check : X;
  }
  return Zap;
};

const getTestResultClass = (backendId: string): string => {
  if (testingBackendId.value === backendId) {
    return "animate-spin";
  }
  if (testResult.value?.backendId === backendId) {
    return testResult.value.success ? "text-success" : "text-destructive";
  }
  return "";
};

/** Why the last test of `backendId` failed; nothing when it passed or was cancelled in holzi. */
const testFailure = (backendId: string): string | null => {
  const result = testResult.value;
  if (!result || result.backendId !== backendId || result.success) return null;
  if (result.kind === "cancelled") return null;
  return result.kind && result.kind !== "other"
    ? t(`backends.failure.${result.kind}`)
    : result.error ?? null;
};

/** holzi asks the user to confirm the removal and names other extensions that lose the storage. */
const removeBackendAsync = async (backend: StorageBackendInfo) => {
  failure.value = null;
  try {
    await backendsStore.removeBackendAsync(backend.id);
  } catch (error) {
    const reason = storageFailure(error);
    if (reason.kind !== "cancelled") failure.value = reason.message;
  }
};
</script>

<i18n lang="yaml">
de:
  title: Einstellungen
  backends:
    title: Speicher
    description: Speicher, die holzi dieser Erweiterung freigegeben hat. Zugangsdaten verwaltet holzi.
    add: Speicher hinzufügen
    edit: Bearbeiten
    test: Verbindung testen
    remove: Entfernen
    empty: Noch kein Speicher freigegeben. Füge einen hinzu, um mit der Synchronisierung zu beginnen.
    failure:
      accessDenied: Zugang verweigert
      network: Anbieter nicht erreichbar
      bucketMissing: Bucket fehlt

en:
  title: Settings
  backends:
    title: Storages
    description: Storages holzi shares with this extension. holzi keeps the credentials.
    add: Add storage
    edit: Edit
    test: Test connection
    remove: Remove
    empty: No storage shared yet. Add one to start syncing.
    failure:
      accessDenied: Access denied
      network: Provider not reachable
      bucketMissing: Bucket missing
</i18n>
