<script setup lang="ts">
import {
  Plus,
  Minus,
  RefreshCw,
  RotateCcw,
  GitCommit,
  ChevronDown,
  ChevronRight,
} from "@lucide/vue";
import { toast } from "vue-sonner";
import { errorMessage } from "~/lib/errors";
import { GitCommandError } from "~/lib/gitOutput";
import { GIT_STATUS_COLOR, GIT_STATUS_LABEL } from "~/lib/gitStatus";
import { relativePath } from "~/lib/path";

const { t } = useI18n();
const gitStore = useGitStore();
const workspace = useWorkspaceStore();
const settings = useSettingsStore();
const editorStore = useEditorStore();
const { stage, unstage, discard: doDiscard, commit: doCommit } = useGit();

const commitMessage = ref("");
const isCommitting = ref(false);
const stagedExpanded = ref(true);
const changesExpanded = ref(true);

const refresh = () => {
  if (workspace.rootPath) gitStore.refresh(workspace.rootPath);
};

const reportGitError = (title: string, error: unknown) => {
  console.error("[haex-code] Git command failed:", error);
  const description = error instanceof GitCommandError ? error.result.output.trim() : errorMessage(error);
  toast.error(title, { description });
};

const runGitAction = async (action: (root: string) => Promise<void>) => {
  const root = workspace.rootPath;
  if (!root) return;
  try {
    await action(root);
  } catch (error) {
    reportGitError(t("gitFailed"), error);
  } finally {
    refresh();
  }
};

const stageFile = (path: string) => runGitAction((root) => stage(root, path));

const unstageFile = (path: string) => runGitAction((root) => unstage(root, path));

const discardFile = (path: string) =>
  runGitAction(async (root) => {
    await doDiscard(root, path);
    // An open tab would otherwise still show, and later save back, the discarded changes.
    const tab = editorStore.tabs.find((t) => relativePath(root, t.path) === path);
    if (tab) await editorStore.reloadCleanTabAsync(tab.id);
  });

// Discarding cannot be undone, so it waits for confirmation. The target is kept apart from the
// open state because the dialog closes itself before the confirm handler runs.
const discardTarget = ref<string | null>(null);
const discardDialogOpen = ref(false);
const askToDiscard = (path: string) => {
  discardTarget.value = path;
  discardDialogOpen.value = true;
};
const confirmDiscard = () => {
  if (discardTarget.value) void discardFile(discardTarget.value);
};

const stageAll = () =>
  runGitAction(async (root) => {
    for (const f of gitStore.unstagedFiles) {
      await stage(root, f.path);
    }
  });

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
  } catch (e) {
    reportGitError(t("commitFailed"), e);
  } finally {
    isCommitting.value = false;
    refresh();
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
          {{ isCommitting ? t('committing') : t('commit') }}
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
          {{ t('staged') }} ({{ gitStore.stagedFiles.length }})
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
              :class="GIT_STATUS_COLOR[file.status]"
            >
              {{ GIT_STATUS_LABEL[file.status] }}
            </span>
            <button
              class="shrink-0 rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100"
              :title="t('unstage')"
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
              @click="askToDiscard(file.path)"
            >
              <RotateCcw class="size-3.5" />
            </button>
            <button
              class="shrink-0 rounded p-1 opacity-0 hover:bg-accent hover:text-green-500 group-hover:opacity-100"
              :title="t('stage')"
              @click="stageFile(file.path)"
            >
              <Plus class="size-3.5" />
            </button>
            <span
              class="shrink-0 font-mono text-xs"
              :class="GIT_STATUS_COLOR[file.status]"
            >
              {{ GIT_STATUS_LABEL[file.status] }}
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

    <ShadcnAlertDialog v-model:open="discardDialogOpen">
      <ShadcnAlertDialogContent>
        <ShadcnAlertDialogHeader>
          <ShadcnAlertDialogTitle>{{ t("discardConfirm.title") }}</ShadcnAlertDialogTitle>
          <ShadcnAlertDialogDescription>
            {{ t("discardConfirm.message", { path: discardTarget ?? "" }) }}
          </ShadcnAlertDialogDescription>
        </ShadcnAlertDialogHeader>
        <ShadcnAlertDialogFooter>
          <ShadcnAlertDialogCancel>{{ t("discardConfirm.cancel") }}</ShadcnAlertDialogCancel>
          <ShadcnAlertDialogAction @click="confirmDiscard">{{ t("discardConfirm.confirm") }}</ShadcnAlertDialogAction>
        </ShadcnAlertDialogFooter>
      </ShadcnAlertDialogContent>
    </ShadcnAlertDialog>
  </div>
</template>

<i18n lang="yaml">
de:
  commitMessage: Commit-Nachricht
  commit: Commit
  staged: Gestagt
  stage: Stagen
  unstage: Unstagen
  committing: Commit...
  refresh: Aktualisieren
  changes: Änderungen
  stageAll: Alle stagen
  discardChanges: Änderungen verwerfen
  noChanges: Keine Änderungen
  gitFailed: Git-Befehl fehlgeschlagen
  commitFailed: Commit fehlgeschlagen
  discardConfirm:
    title: Änderungen verwerfen?
    message: "Alle nicht gestagten Änderungen an {path} gehen verloren. Das lässt sich nicht rückgängig machen."
    cancel: Abbrechen
    confirm: Verwerfen
en:
  commitMessage: Commit message
  commit: Commit
  staged: Staged
  stage: Stage
  unstage: Unstage
  committing: Committing...
  refresh: Refresh
  changes: Changes
  stageAll: Stage all
  discardChanges: Discard changes
  noChanges: No changes
  gitFailed: Git command failed
  commitFailed: Commit failed
  discardConfirm:
    title: Discard changes?
    message: "All unstaged changes to {path} will be lost. This cannot be undone."
    cancel: Cancel
    confirm: Discard
</i18n>
