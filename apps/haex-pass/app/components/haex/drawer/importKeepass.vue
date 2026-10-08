<template>
  <UiDrawerModal
    v-model:open="isOpen"
    :title="t('title')"
    :description="t('selectFile')"
  >
    <template #content>
      <div class="space-y-4">
        <!-- File Upload -->
        <div class="space-y-2">
          <ShadcnLabel>{{ t("kdbxFile") }}</ShadcnLabel>
          <input
            ref="fileInput"
            type="file"
            accept=".kdbx"
            class="hidden"
            @change="onFileChangeAsync"
          />
          <UiButton
            :icon="File"
            variant="outline"
            class="w-full justify-start"
            @click="fileInput?.click()"
          >
            {{ selectedFileName || t("chooseFile") }}
          </UiButton>
        </div>

        <!-- Password Input -->
        <div v-if="fileData" class="space-y-2">
          <ShadcnLabel>{{ t("password") }}</ShadcnLabel>
          <ShadcnInputGroup>
            <ShadcnInputGroupInput
              ref="passwordInput"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              :placeholder="t('passwordPlaceholder')"
              autofocus
              @keyup.enter="canImport && importAsync()"
            />
            <ShadcnInputGroupButton
              :icon="showPassword ? EyeOff : Eye"
              variant="ghost"
              @click="showPassword = !showPassword"
            />
          </ShadcnInputGroup>
        </div>

        <!-- Import Progress -->
        <div v-if="importing" class="space-y-2">
          <ShadcnProgress v-model="progress" />
          <div class="text-sm text-center text-muted-foreground">
            {{ t("importing") }}: {{ progress }}%
          </div>
        </div>

        <!-- Error -->
        <div
          v-if="error"
          class="p-4 bg-destructive/10 text-destructive rounded-lg text-sm"
        >
          {{ error }}
        </div>
      </div>
    </template>

    <template #footer>
      <UiButton :disabled="!canImport" @click="importAsync">
        {{ t("import") }}
      </UiButton>
      <UiButton variant="outline" @click="isOpen = false">
        {{ t("cancel") }}
      </UiButton>
    </template>
  </UiDrawerModal>
</template>

<script setup lang="ts">
import { toast } from "vue-sonner";
import { File, Eye, EyeOff } from "@lucide/vue";
import { importKdbxAsync } from "~/utils/import/keepass";

const isOpen = defineModel<boolean>("open", { default: false });
const { t } = useI18n();

const fileInput = useTemplateRef<HTMLInputElement>("fileInput");
const fileData = ref<ArrayBuffer | null>(null);
const selectedFileName = ref<string | null>(null);
const password = ref("");
const showPassword = ref(false);
const importing = ref(false);
const progress = ref(0);
const error = ref<string | null>(null);

// Computed: Can import when file and password are provided
const canImport = computed(() => {
  return !!fileData.value && !!password.value && !importing.value;
});

const onFileChangeAsync = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (!file) {
    selectedFileName.value = null;
    return;
  }

  selectedFileName.value = file.name;

  error.value = null;
  password.value = "";

  try {
    const buffer = await file.arrayBuffer();
    fileData.value = buffer;
    // Password input will auto-focus via autofocus prop
  } catch (err) {
    error.value = t("error.parse");
    console.error(err);
  }
};

const importAsync = async () => {
  if (!fileData.value) {
    error.value = t("error.noFile");
    return;
  }

  if (!password.value) {
    error.value = t("error.noPassword");
    return;
  }

  importing.value = true;
  progress.value = 0;
  error.value = null;

  try {
    const stats = await importKdbxAsync(fileData.value, password.value, progress);

    toast.success(t("success"), {
      description: t("successDescription", {
        groups: stats.groupCount,
        entries: stats.entryCount,
      }),
    });

    isOpen.value = false;
    fileData.value = null;
    password.value = "";
    selectedFileName.value = null;
  } catch (err) {
    console.error("[KeePass Import] Error:", err);
    console.error(
      "[KeePass Import] Error stack:",
      err instanceof Error ? err.stack : undefined
    );
    console.error(
      "[KeePass Import] Error message:",
      err instanceof Error ? err.message : String(err)
    );
    // Log the underlying cause if it's a DrizzleQueryError
    if (err instanceof Error && "cause" in err) {
      console.error("[KeePass Import] Error cause:", err.cause);
    }

    const errorMessage = err instanceof Error ? err.message : String(err);

    if (
      errorMessage.includes("InvalidKey") ||
      errorMessage.includes("password")
    ) {
      error.value = t("error.wrongPassword");
    } else {
      error.value = t("error.import") + ": " + errorMessage;
    }
  } finally {
    importing.value = false;
    progress.value = 0;
  }
};

// Reset state when drawer closes
watch(isOpen, (newValue) => {
  if (!newValue) {
    fileData.value = null;
    selectedFileName.value = null;
    password.value = "";
    error.value = null;
    importing.value = false;
    progress.value = 0;
    showPassword.value = false;
  }
});
</script>

<i18n lang="yaml">
de:
  title: KeePass Import
  selectFile: KeePass-Datei auswählen (.kdbx)
  kdbxFile: KDBX-Datei
  chooseFile: Datei auswählen
  password: Master-Passwort
  passwordPlaceholder: Gib dein KeePass Master-Passwort ein
  import: Importieren
  cancel: Abbrechen
  importing: Importiere
  error:
    parse: Fehler beim Lesen der Datei
    wrongPassword: Falsches Passwort
    noFile: Keine Datei ausgewählt
    noPassword: Bitte Master-Passwort eingeben
    import: Fehler beim Importieren
  success: Import erfolgreich
  successDescription: "{groups} Gruppen und {entries} Einträge wurden importiert"

en:
  title: KeePass Import
  selectFile: Select KeePass file (.kdbx)
  kdbxFile: KDBX File
  chooseFile: Choose file
  password: Master Password
  passwordPlaceholder: Enter your KeePass master password
  import: Import
  cancel: Cancel
  importing: Importing
  error:
    parse: Error reading file
    wrongPassword: Wrong password
    noFile: No file selected
    noPassword: Please enter master password
    import: Error importing data
  success: Import successful
  successDescription: "{groups} groups and {entries} entries imported"
</i18n>
