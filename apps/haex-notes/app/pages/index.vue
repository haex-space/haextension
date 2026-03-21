<script setup lang="ts">
import { Plus, BookOpen } from "lucide-vue-next";
import type { SelectNotebook, PageTemplate } from "~/database/schemas";
import { PAGE_TEMPLATES } from "~/utils/pageTemplates";

const { t, locale } = useI18n();
const router = useRouter();
const localePath = useLocalePath();
const haexVault = useHaexVaultStore();
const notebookStore = useNotebookStore();
const pencilCaseStore = usePencilCaseStore();

const allNotebooks = ref<SelectNotebook[]>([]);
const isLoaded = ref(false);
const showNewDialog = ref(false);
const newName = ref("");
const newTemplate = ref<PageTemplate>("lined");
const newColor = ref("#3b82f6");

const coverColors = ["#3b82f6", "#ef4444", "#22c55e", "#f97316", "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b", "#6366f1", "#1e293b"];

const loadNotebooks = async () => {
  allNotebooks.value = (await notebookStore.listNotebooksAsync()).reverse();
};

onMounted(async () => {
  await haexVault.initializeAsync();
  await pencilCaseStore.loadAsync();
  await loadNotebooks();
  isLoaded.value = true;
});

const createNotebook = async () => {
  const name = newName.value.trim() || "Notizbuch";
  const id = await notebookStore.createNotebookAsync(name, newTemplate.value, newColor.value);
  if (id) {
    showNewDialog.value = false;
    newName.value = "";
    router.push(localePath(`/notebook/${id}`));
  }
};

const openNotebook = (id: string) => {
  router.push(localePath(`/notebook/${id}`));
};

const deleteNotebook = async (id: string) => {
  if (!confirm(t("confirmDelete"))) return;
  await notebookStore.deleteNotebookAsync(id);
  await loadNotebooks();
};

const renameNotebook = async (id: string, name: string) => {
  await notebookStore.renameNotebookAsync(id, name);
  await loadNotebooks();
};
</script>

<template>
  <div v-if="isLoaded" class="flex h-full flex-col bg-background">
    <!-- Header -->
    <header class="flex items-center justify-between border-b border-border px-6 py-4">
      <div class="flex items-center gap-3">
        <BookOpen class="size-6 text-primary" />
        <h1 class="text-xl font-semibold text-foreground">haex-notes</h1>
      </div>
      <button
        class="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        @click="showNewDialog = true"
      >
        <Plus class="size-4" />
        {{ t("newNotebook") }}
      </button>
    </header>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-6">
      <!-- Empty state -->
      <div v-if="allNotebooks.length === 0" class="flex h-full flex-col items-center justify-center gap-4">
        <BookOpen class="size-16 text-muted-foreground/20" />
        <p class="text-sm text-muted-foreground">{{ t("emptyState") }}</p>
        <button
          class="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          @click="showNewDialog = true"
        >
          <Plus class="size-4" />
          {{ t("createFirst") }}
        </button>
      </div>

      <!-- Notebook Grid -->
      <div v-else class="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        <div
          v-for="nb in allNotebooks"
          :key="nb.id"
          class="group cursor-pointer"
          @click="openNotebook(nb.id)"
        >
          <!-- Notebook cover -->
          <div
            class="relative aspect-[3/4] overflow-hidden rounded-lg border-2 border-border shadow-md transition-all group-hover:shadow-xl group-hover:scale-[1.02]"
            :style="{ backgroundColor: nb.coverColor }"
          >
            <img
              v-if="nb.coverImage"
              :src="nb.coverImage"
              class="absolute inset-0 h-full w-full object-cover"
            />
            <!-- Notebook spine effect -->
            <div class="absolute inset-y-0 left-0 w-3 bg-black/10" />
            <!-- Title on cover -->
            <div class="absolute inset-x-4 top-6 rounded bg-white/90 px-2 py-1.5 text-center">
              <span class="text-xs font-semibold text-gray-800 line-clamp-2">{{ nb.name }}</span>
            </div>
          </div>
          <!-- Name + actions below -->
          <div class="mt-2 flex items-center gap-1">
            <input
              :value="nb.name"
              class="h-6 min-w-0 flex-1 truncate rounded border border-transparent bg-transparent px-0.5 text-xs text-foreground hover:border-input focus:border-input focus:bg-background focus:outline-none"
              @click.stop
              @change="renameNotebook(nb.id, ($event.target as HTMLInputElement).value)"
            />
            <button
              class="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
              @click.stop="deleteNotebook(nb.id)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- New Notebook Dialog -->
    <ShadcnDialog v-model:open="showNewDialog">
      <ShadcnDialogContent class="sm:max-w-md">
        <ShadcnDialogHeader>
          <ShadcnDialogTitle>{{ t("newNotebook") }}</ShadcnDialogTitle>
        </ShadcnDialogHeader>
        <div class="flex flex-col gap-4 py-2">
          <div>
            <label class="mb-1 block text-sm font-medium">{{ t("name") }}</label>
            <input
              v-model="newName"
              class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              :placeholder="t('notebookPlaceholder')"
              @keydown.enter="createNotebook"
            />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium">{{ t("pageType") }}</label>
            <select
              v-model="newTemplate"
              class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option v-for="tmpl in PAGE_TEMPLATES" :key="tmpl.id" :value="tmpl.id">
                {{ locale === 'de' ? tmpl.i18n.de : tmpl.i18n.en }}
              </option>
            </select>
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium">{{ t("coverColor") }}</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="color in coverColors"
                :key="color"
                class="size-8 rounded-lg border-2 transition-transform hover:scale-110"
                :class="newColor === color ? 'border-foreground scale-110' : 'border-transparent'"
                :style="{ backgroundColor: color }"
                @click="newColor = color"
              />
            </div>
          </div>
        </div>
        <div class="flex justify-end pt-2">
          <button
            class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            @click="createNotebook"
          >
            {{ t("create") }}
          </button>
        </div>
      </ShadcnDialogContent>
    </ShadcnDialog>
  </div>
</template>

<i18n lang="yaml">
de:
  newNotebook: Neues Notizbuch
  emptyState: Noch keine Notizbücher vorhanden
  createFirst: Erstelle dein erstes Notizbuch
  confirmDelete: Dieses Notizbuch und alle Seiten wirklich löschen?
  name: Name
  notebookPlaceholder: z.B. Mathe Klasse 3
  pageType: Seitentyp
  coverColor: Umschlagfarbe
  create: Erstellen
en:
  newNotebook: New Notebook
  emptyState: No notebooks yet
  createFirst: Create your first notebook
  confirmDelete: Really delete this notebook and all pages?
  name: Name
  notebookPlaceholder: e.g. Math Grade 3
  pageType: Page Type
  coverColor: Cover Color
  create: Create
</i18n>
