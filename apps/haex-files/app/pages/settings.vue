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
                <div class="text-sm text-muted-foreground">
                  {{ getBackendTypeLabel(backend.type) }}
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
                  @click="confirmRemoveBackend(backend)"
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

    <!-- Delete Confirmation Dialog -->
    <ShadcnAlertDialog v-model:open="deleteDialogOpen">
      <ShadcnAlertDialogContent>
        <ShadcnAlertDialogHeader>
          <ShadcnAlertDialogTitle>{{
            t("backends.deleteTitle")
          }}</ShadcnAlertDialogTitle>
          <ShadcnAlertDialogDescription>
            {{
              t("backends.deleteDescription", { name: backendToDelete?.name })
            }}
          </ShadcnAlertDialogDescription>
        </ShadcnAlertDialogHeader>
        <ShadcnAlertDialogFooter>
          <ShadcnAlertDialogCancel>{{ t("cancel") }}</ShadcnAlertDialogCancel>
          <ShadcnAlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="removeBackendAsync"
          >
            {{ t("delete") }}
          </ShadcnAlertDialogAction>
        </ShadcnAlertDialogFooter>
      </ShadcnAlertDialogContent>
    </ShadcnAlertDialog>
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
} from "lucide-vue-next";
import type { StorageBackendInfo } from "~/stores/backends";

const { t } = useI18n();
const router = useRouter();
const backendsStore = useBackendsStore();

const { backends, testingBackendId, testResult } = storeToRefs(backendsStore);

const addBackendDrawerOpen = ref(false);
const editingBackend = ref<StorageBackendInfo | null>(null);
const deleteDialogOpen = ref(false);
const backendToDelete = ref<StorageBackendInfo | null>(null);

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

const getBackendTypeLabel = (type: string): string => {
  switch (type) {
    case "s3":
      return "S3-compatible Storage";
    default:
      return type;
  }
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

const confirmRemoveBackend = (backend: StorageBackendInfo) => {
  backendToDelete.value = backend;
  deleteDialogOpen.value = true;
};

const removeBackendAsync = async () => {
  if (!backendToDelete.value) return;

  await backendsStore.removeBackendAsync(backendToDelete.value.id);
  deleteDialogOpen.value = false;
  backendToDelete.value = null;
};
</script>

<i18n lang="yaml">
de:
  title: Einstellungen
  cancel: Abbrechen
  delete: Löschen
  backends:
    title: Speicher-Backends
    description: Verwalte deine Cloud-Speicher für die Synchronisierung.
    add: Backend hinzufügen
    edit: Bearbeiten
    test: Verbindung testen
    remove: Entfernen
    empty: Noch keine Backends konfiguriert. Füge einen Speicher hinzu, um mit der Synchronisierung zu beginnen.
    deleteTitle: Backend entfernen?
    deleteDescription: Möchtest du "{name}" wirklich entfernen? Dateien auf diesem Backend werden nicht gelöscht.

en:
  title: Settings
  cancel: Cancel
  delete: Delete
  backends:
    title: Storage Backends
    description: Manage your cloud storage backends for synchronization.
    add: Add Backend
    edit: Edit
    test: Test Connection
    remove: Remove
    empty: No backends configured yet. Add a storage backend to start syncing.
    deleteTitle: Remove Backend?
    deleteDescription: Are you sure you want to remove "{name}"? Files on this backend will not be deleted.
</i18n>
