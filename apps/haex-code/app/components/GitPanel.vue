<script setup lang="ts">
import {
  Plus,
  Minus,
  RefreshCw,
  RotateCcw,
  GitCommit,
  ChevronDown,
  ChevronRight,
} from "lucide-vue-next";

const { t } = useI18n();
const gitStore = useGitStore();
const workspace = useWorkspaceStore();
const settings = useSettingsStore();
const { stage, unstage, discard: doDiscard, commit: doCommit } = useGit();

const commitMessage = ref("");
const isCommitting = ref(false);
const stagedExpanded = ref(true);
const changesExpanded = ref(true);

const statusLabel: Record<string, string> = {
  modified: "M",
  deleted: "D",
  untracked: "U",
  "staged-added": "A",
  "staged-modified": "M",
  "staged-deleted": "D",
  staged: "M",
};

const statusColor: Record<string, string> = {
  modified: "text-yellow-500",
  deleted: "text-red-500",
  untracked: "text-green-500",
  "staged-added": "text-green-500",
  "staged-modified": "text-yellow-500",
  "staged-deleted": "text-red-500",
  staged: "text-yellow-500",
};

const refresh = () => {
  if (workspace.rootPath) gitStore.refresh(workspace.rootPath);
};

const stageFile = async (path: string) => {
  if (!workspace.rootPath) return;
  await stage(workspace.rootPath, path);
  refresh();
};

const unstageFile = async (path: string) => {
  if (!workspace.rootPath) return;
  await unstage(workspace.rootPath, path);
  refresh();
};

const discardFile = async (path: string) => {
  if (!workspace.rootPath) return;
  await doDiscard(workspace.rootPath, path);
  refresh();
};

const stageAll = async () => {
  if (!workspace.rootPath) return;
  for (const f of gitStore.unstagedFiles) {
    if (f.status !== "deleted") await stage(workspace.rootPath, f.path);
  }
  refresh();
};

const handleCommit = async () => {
  if (
    !workspace.rootPath ||
    !commitMessage.value.trim() ||
    gitStore.stagedFiles.length === 0
  )
    return;
  isCommitting.value = true;
  try {
    await doCommit(workspace.rootPath, commitMessage.value.trim());
    commitMessage.value = "";
    refresh();
  } catch (e) {
    console.error("[haex-code] Commit failed:", e);
  } finally {
    isCommitting.value = false;
  }
};
</script>

<template>
  <div class="flex h-full flex-col text-sm">
    <!-- Commit box -->
    <div class="border-b border-border p-2">
      <textarea
        v-model="commitMessage"
        :placeholder="t('commitMessage')"
        rows="3"
        class="w-full resize-none rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        :class="settings.scale.fontSize"
      />
      <div class="mt-1.5 flex items-center gap-1">
        <button
          class="flex flex-1 items-center justify-center gap-1.5 rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          :disabled="
            !commitMessage.trim() ||
            gitStore.stagedFiles.length === 0 ||
            isCommitting
          "
          @click="handleCommit"
        >
          <GitCommit class="size-3" />
          {{ isCommitting ? t('committing') : "Commit" }}
        </button>
        <button
          class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          :title="t('refresh')"
          @click="refresh"
        >
          <RefreshCw
            class="size-3.5"
            :class="gitStore.isLoading ? 'animate-spin' : ''"
          />
        </button>
      </div>
    </div>

    <ShadcnScrollArea class="flex-1">
      <!-- Staged Changes -->
      <div v-if="gitStore.stagedFiles.length > 0">
        <button
          class="flex w-full items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent"
          @click="stagedExpanded = !stagedExpanded"
        >
          <ChevronDown v-if="stagedExpanded" class="size-3" />
          <ChevronRight v-else class="size-3" />
          Staged ({{ gitStore.stagedFiles.length }})
        </button>

        <template v-if="stagedExpanded">
          <div
            v-for="file in gitStore.stagedFiles"
            :key="file.path"
            class="group flex items-center gap-1 px-2 hover:bg-accent"
            :class="settings.scale.rowPadding"
          >
            <span
              class="flex-1 truncate"
              :class="settings.scale.fontSize"
              :title="file.path"
            >
              {{ file.path.split("/").pop() }}
              <span class="ml-1 text-muted-foreground/60">{{
                file.path.includes("/")
                  ? file.path.split("/").slice(0, -1).join("/")
                  : ""
              }}</span>
            </span>
            <span
              class="shrink-0 font-mono text-xs"
              :class="statusColor[file.status] ?? 'text-muted-foreground'"
            >
              {{ statusLabel[file.status] ?? "?" }}
            </span>
            <button
              class="shrink-0 rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100"
              title="Unstage"
              @click="unstageFile(file.path)"
            >
              <Minus class="size-3" />
            </button>
          </div>
        </template>
      </div>

      <!-- Changes -->
      <div>
        <button
          class="flex w-full items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent"
          @click="changesExpanded = !changesExpanded"
        >
          <ChevronDown v-if="changesExpanded" class="size-3" />
          <ChevronRight v-else class="size-3" />
          {{ t('changes') }} ({{ gitStore.unstagedFiles.length }})
          <button
            v-if="gitStore.unstagedFiles.length > 0"
            class="ml-auto rounded p-0.5 hover:bg-accent/80 hover:text-green-500"
            :title="t('stageAll')"
            @click.stop="stageAll"
          >
            <Plus class="size-4" />
          </button>
        </button>

        <template v-if="changesExpanded">
          <div
            v-for="file in gitStore.unstagedFiles"
            :key="file.path"
            class="group flex items-center gap-1 px-2 hover:bg-accent"
            :class="settings.scale.rowPadding"
          >
            <span
              class="flex-1 truncate"
              :class="settings.scale.fontSize"
              :title="file.path"
            >
              {{ file.path.split("/").pop() }}
              <span class="ml-1 text-muted-foreground/60">{{
                file.path.includes("/")
                  ? file.path.split("/").slice(0, -1).join("/")
                  : ""
              }}</span>
            </span>
            <button
              v-if="file.status !== 'untracked'"
              class="shrink-0 rounded p-1 opacity-0 hover:bg-accent hover:text-destructive group-hover:opacity-100"
              :title="t('discardChanges')"
              @click="discardFile(file.path)"
            >
              <RotateCcw class="size-3.5" />
            </button>
            <button
              class="shrink-0 rounded p-1 opacity-0 hover:bg-accent hover:text-green-500 group-hover:opacity-100"
              title="Stage"
              @click="stageFile(file.path)"
            >
              <Plus class="size-3.5" />
            </button>
            <span
              class="shrink-0 font-mono text-xs"
              :class="statusColor[file.status] ?? 'text-muted-foreground'"
            >
              {{ statusLabel[file.status] ?? "?" }}
            </span>
          </div>

          <div
            v-if="
              gitStore.unstagedFiles.length === 0 &&
              gitStore.stagedFiles.length === 0
            "
            class="px-3 py-4 text-center text-xs text-muted-foreground"
          >
            {{ t('noChanges') }}
          </div>
        </template>
      </div>
    </ShadcnScrollArea>
  </div>
</template>

<i18n lang="yaml">
de:
  commitMessage: Commit-Nachricht
  committing: Commit...
  refresh: Aktualisieren
  changes: Änderungen
  stageAll: Alle stagen
  discardChanges: Änderungen verwerfen
  noChanges: Keine Änderungen
en:
  commitMessage: Commit message
  committing: Committing...
  refresh: Refresh
  changes: Changes
  stageAll: Stage all
  discardChanges: Discard changes
  noChanges: No changes
</i18n>
