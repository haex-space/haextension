<template>
  <NuxtLayout name="passwords">
    <div class="flex-1 p-2">
      <ShadcnItemGroup v-if="groupItems.length">
        <ShadcnContextMenu v-for="item in groupItems" :key="item.id">
          <ShadcnContextMenuTrigger as-child>
            <ShadcnItem
              :ref="(el) => setupLongPress(el, item)"
              :class="[
                'cursor-pointer transition-colors',
                {
                  'bg-primary/10 border-primary': selectionStore.isSelected(
                    item.id
                  ),
                  'opacity-50': selectionStore.isCut(item.id),
                },
              ]"
              @click="onClickItemAsync(item, $event)"
              @dblclick="onDoubleClickItemAsync(item)"
            >
              <ShadcnItemMedia
                variant="icon"
                :style="
                  item.color ? { backgroundColor: item.color } : undefined
                "
              >
                <HaexIcon
                  :icon="item.icon"
                  class="w-4 h-4"
                  :style="
                    item.color ? { color: getTextColor(item.color) } : undefined
                  "
                />
              </ShadcnItemMedia>
              <ShadcnItemContent>
                <ShadcnItemTitle>{{ item.name }}</ShadcnItemTitle>
                <!-- Show username and URL on medium screens and up -->
                <ShadcnItemDescription
                  v-if="item.type === 'item'"
                  class="hidden md:grid grid-cols-2 gap-4 text-xs"
                >
                  <span class="flex items-center gap-1 truncate">
                    <User class="w-3 h-3 shrink-0" />
                    <span class="truncate">{{ item.username || "-" }}</span>
                  </span>
                  <span class="flex items-center gap-1 truncate">
                    <Globe class="w-3 h-3 shrink-0" />
                    <span class="truncate">{{ item.url || "-" }}</span>
                  </span>
                </ShadcnItemDescription>
              </ShadcnItemContent>
              <ShadcnItemActions>
                <ShadcnTooltip
                  v-if="item.type === 'item' && isItemExpired(item)"
                >
                  <ShadcnTooltipTrigger>
                    <AlertTriangle class="w-4 h-4 text-destructive" />
                  </ShadcnTooltipTrigger>
                  <ShadcnTooltipContent>
                    {{ t("expired") }}
                  </ShadcnTooltipContent>
                </ShadcnTooltip>
                <ChevronRight v-if="item.type === 'group'" class="w-4 h-4" />
              </ShadcnItemActions>
            </ShadcnItem>
          </ShadcnContextMenuTrigger>

          <ShadcnContextMenuContent v-if="isMediumScreen">
            <template v-if="item.type === 'item'">
              <ShadcnContextMenuItem
                :disabled="selectionStore.selectedCount > 1"
                @click="onCopyPassword(item)"
              >
                <Copy class="w-4 h-4 mr-2" />
                {{ t("copyPassword") }}
                <ShadcnContextMenuShortcut>Ctrl+C</ShadcnContextMenuShortcut>
              </ShadcnContextMenuItem>
              <ShadcnContextMenuItem
                :disabled="selectionStore.selectedCount > 1"
                @click="onCopyUsername(item)"
              >
                <User class="w-4 h-4 mr-2" />
                {{ t("copyUsername") }}
                <ShadcnContextMenuShortcut>Ctrl+B</ShadcnContextMenuShortcut>
              </ShadcnContextMenuItem>
              <ShadcnContextMenuItem
                :disabled="selectionStore.selectedCount > 1"
                @click="onCopyUrl(item)"
              >
                <Link class="w-4 h-4 mr-2" />
                {{ t("copyUrl") }}
                <ShadcnContextMenuShortcut>Ctrl+U</ShadcnContextMenuShortcut>
              </ShadcnContextMenuItem>
              <ShadcnContextMenuItem
                :disabled="selectionStore.selectedCount > 1"
                @click="onOpenUrl(item)"
              >
                <ExternalLink class="w-4 h-4 mr-2" />
                {{ t("openUrl") }}
                <ShadcnContextMenuShortcut
                  >Ctrl+Shift+U</ShadcnContextMenuShortcut
                >
              </ShadcnContextMenuItem>
              <ShadcnContextMenuItem @click="onDownloadFavicon(item)">
                <ImageDown class="w-4 h-4 mr-2" />
                {{ t("downloadFavicon") }}
              </ShadcnContextMenuItem>
              <ShadcnContextMenuSub v-if="tags.length > 0">
                <ShadcnContextMenuSubTrigger>
                  <Tag class="w-4 h-4 mr-2" />
                  {{ t("tags") }}
                </ShadcnContextMenuSubTrigger>
                <ShadcnContextMenuSubContent class="max-h-64 overflow-y-auto">
                  <ShadcnContextMenuItem
                    v-for="tag in tags"
                    :key="tag.id"
                    @click="onToggleTag(item, tag.id)"
                  >
                    <span
                      v-if="tag.color"
                      class="w-3 h-3 rounded-full mr-2 shrink-0"
                      :style="{ backgroundColor: tag.color }"
                    />
                    <span v-else class="w-3 h-3 mr-2 shrink-0" />
                    <span class="flex-1">{{ tag.name }}</span>
                    <Check
                      v-if="itemTagsMap.get(item.id)?.has(tag.id)"
                      class="w-4 h-4 ml-2"
                    />
                  </ShadcnContextMenuItem>
                </ShadcnContextMenuSubContent>
              </ShadcnContextMenuSub>
              <ShadcnContextMenuSeparator />
            </template>
            <ShadcnContextMenuItem
              :disabled="selectionStore.selectedCount > 1"
              @click="onEditItem(item)"
            >
              <Edit class="w-4 h-4 mr-2" />
              {{ t("edit") }}
            </ShadcnContextMenuItem>
            <ShadcnContextMenuItem
              v-if="!isInTrash"
              :disabled="selectionStore.selectedCount > 1"
              @click="onCloneItem(item)"
            >
              <CopyPlus class="w-4 h-4 mr-2" />
              {{ t("clone") }}
              <ShadcnContextMenuShortcut>Ctrl+K</ShadcnContextMenuShortcut>
            </ShadcnContextMenuItem>
            <ShadcnContextMenuItem
              v-if="isInTrash"
              :disabled="selectionStore.selectedCount > 1"
              @click="onRestoreItem(item)"
            >
              <RotateCcw class="w-4 h-4 mr-2" />
              {{ t("restore") }}
            </ShadcnContextMenuItem>
            <ShadcnContextMenuItem
              class="text-destructive focus:text-destructive"
              @click="onDeleteItem(item)"
            >
              <Trash class="w-4 h-4 mr-2" />
              {{ t("delete") }}
              <ShadcnContextMenuShortcut>{{
                t("deleteShortcut")
              }}</ShadcnContextMenuShortcut>
            </ShadcnContextMenuItem>
          </ShadcnContextMenuContent>
        </ShadcnContextMenu>
      </ShadcnItemGroup>
      <div v-else class="flex justify-center items-center flex-1">
        <p class="text-muted-foreground">{{ t("noItems") }}</p>
      </div>
    </div>

  </NuxtLayout>
</template>

<script setup lang="ts">
import {
  ChevronRight,
  Edit,
  Trash,
  Copy,
  CopyPlus,
  User,
  ExternalLink,
  Globe,
  Link,
  ImageDown,
  RotateCcw,
  AlertTriangle,
  Tag,
  Check,
} from "@lucide/vue";
import type { IPasswordMenuItem } from "~/types/password";
import { onLongPress } from "@vueuse/core";
import { toast } from "vue-sonner";

definePageMeta({
  name: "passwordGroupItems",
});

const { t } = useI18n();
const localePath = useLocalePath();

const { getTextColor } = useIconComponents();
const selectionStore = useSelectionStore();
const { groupItems } = storeToRefs(useGroupItemsMenuStore());
const { isMediumScreen } = storeToRefs(useUiStore());
const { inTrashGroup: isInTrash } = storeToRefs(useGroupTreeStore());

// Tags
const tagStore = useTagStore();
const { tags } = storeToRefs(tagStore);

// Track which tags each item has (for showing checkmarks)
const itemTagsMap = ref<Map<string, Set<string>>>(new Map());

// Load tags for visible items
const loadItemTagsAsync = async () => {
  const newMap = new Map<string, Set<string>>();
  for (const item of groupItems.value) {
    if (item.type === "item") {
      const itemTags = await tagStore.getItemTagsAsync(item.id);
      newMap.set(item.id, new Set(itemTags.map((t) => t.id)));
    }
  }
  itemTagsMap.value = newMap;
};

// Reload tags when group items change
watch(groupItems, () => loadItemTagsAsync(), { immediate: true });

// Initialize tag store
onMounted(async () => {
  await tagStore.syncTagsAsync();
  await tagStore.syncItemTagLinksAsync();
});

const onToggleTag = async (item: IPasswordMenuItem, tagId: string) => {
  const added = await tagStore.toggleTagOnItemAsync(item.id, tagId);

  // Update local map
  const itemTags = itemTagsMap.value.get(item.id) || new Set();
  if (added) {
    itemTags.add(tagId);
  } else {
    itemTags.delete(tagId);
  }
  itemTagsMap.value.set(item.id, itemTags);

  // Show feedback
  const tag = tags.value.find((t) => t.id === tagId);
  if (tag) {
    toast.success(added ? t("tagAdded", { tag: tag.name }) : t("tagRemoved", { tag: tag.name }));
  }
};

// Helper to check if an item's password is expired
const isItemExpired = (item: IPasswordMenuItem) => {
  if (!item.expiresAt) return false;
  const expiryDate = new Date(item.expiresAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiryDate < today;
};

// Long press functionality
const longPressedHook = ref(false);

const setupLongPress = (el: unknown, item: IPasswordMenuItem) => {
  const element = el as { $el?: HTMLElement } | null;
  if (!element?.$el) return;

  onLongPress(
    element.$el,
    () => {
      longPressedHook.value = true;
      selectionStore.isSelectionMode = true;
      selectionStore.selectItem(item.id);
    },
    { delay: 500 }
  );
};

// Auto-exit selection mode when all items are deselected
watch(
  () => selectionStore.selectedCount,
  (count) => {
    if (count === 0) {
      longPressedHook.value = false;
    }
  }
);

const onClickItemAsync = async (item: IPasswordMenuItem, event: MouseEvent) => {
  // If long press just happened, ignore the first click event
  if (longPressedHook.value && selectionStore.isSelected(item.id)) {
    event.preventDefault();
    longPressedHook.value = false;
    return;
  }

  // Desktop behavior: single click selects one item, Ctrl/Cmd for multi-select
  if (isMediumScreen.value) {
    event.preventDefault();
    selectionStore.isSelectionMode = true;

    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd click: toggle selection (multi-select)
      selectionStore.toggleSelection(item.id);
    } else {
      // Normal click: select only this item (replace selection)
      selectionStore.clearSelection();
      selectionStore.selectItem(item.id);
    }
    longPressedHook.value = false;
    return;
  }

  // Mobile behavior: long press or existing selection for multi-select
  if (
    longPressedHook.value ||
    selectionStore.selectedCount > 0 ||
    event.ctrlKey ||
    event.metaKey
  ) {
    event.preventDefault();

    // Enable selection mode when entering via long press or ctrl
    if (longPressedHook.value || event.ctrlKey || event.metaKey) {
      selectionStore.isSelectionMode = true;
    }

    // Toggle the item
    selectionStore.toggleSelection(item.id);
    longPressedHook.value = false;
    return;
  }

  // Mobile: normal navigation on single click
  if (item.type === "group") {
    await navigateTo(
      localePath({
        name: "passwordGroupItems",
        params: {
          groupId: item.id,
        },
      })
    );
  } else {
    await navigateTo(
      localePath({
        name: "passwordItemEdit",
        params: { ...useRouter().currentRoute.value.params, itemId: item.id },
      })
    );
  }
};

const onDoubleClickItemAsync = async (item: IPasswordMenuItem) => {
  // Double click only navigates on desktop (when sidebar is visible)
  if (!isMediumScreen.value) return;

  // Clear selection when navigating
  selectionStore.clearSelection();

  if (item.type === "group") {
    await navigateTo(
      localePath({
        name: "passwordGroupItems",
        params: {
          groupId: item.id,
        },
      })
    );
  } else {
    await navigateTo(
      localePath({
        name: "passwordItemEdit",
        params: { ...useRouter().currentRoute.value.params, itemId: item.id },
      })
    );
  }
};

const {
  onEditItem,
  onDeleteItem,
  onRestoreItem,
  onCloneItem,
  onCopyPassword,
  onCopyUsername,
  onCopyUrl,
  onDownloadFavicon,
  onOpenUrl,
} = useGroupItemActions(t);
</script>

<i18n lang="yaml">
de:
  noItems: Keine Einträge vorhanden
  edit: Bearbeiten
  delete: Löschen
  deleteShortcut: Entf
  restore: Wiederherstellen
  copyPassword: Passwort kopieren
  copyUsername: Benutzername kopieren
  copyUrl: URL kopieren
  openUrl: URL öffnen
  downloadFavicon: Favicon herunterladen
  expired: Passwort abgelaufen
  urlPermissionRequired: Berechtigung erforderlich - bitte in der App bestätigen
  urlInvalid: Ungültige URL
  urlOpenFailed: URL konnte nicht geöffnet werden
  clone: Duplizieren
  cloneSuffix: "- Kopie"
  cloneSuccess: Eintrag dupliziert
  cloneFailed: Eintrag konnte nicht dupliziert werden
  faviconSuccess: "{count} Favicon(s) heruntergeladen"
  faviconPartial: "{success} heruntergeladen, {fail} fehlgeschlagen"
  faviconFailed: Favicon konnte nicht heruntergeladen werden
  tags: Tags
  tagAdded: "Tag \"{tag}\" hinzugefügt"
  tagRemoved: "Tag \"{tag}\" entfernt"

en:
  noItems: No items available
  edit: Edit
  delete: Delete
  deleteShortcut: Del
  restore: Restore
  copyPassword: Copy password
  copyUsername: Copy username
  copyUrl: Copy URL
  openUrl: Open URL
  downloadFavicon: Download favicon
  expired: Password expired
  urlPermissionRequired: Permission required - please confirm in the app
  urlInvalid: Invalid URL
  urlOpenFailed: Could not open URL
  clone: Duplicate
  cloneSuffix: "- Copy"
  cloneSuccess: Entry duplicated
  cloneFailed: Could not duplicate entry
  faviconSuccess: "{count} favicon(s) downloaded"
  faviconPartial: "{success} downloaded, {fail} failed"
  faviconFailed: Could not download favicon
  tags: Tags
  tagAdded: "Tag \"{tag}\" added"
  tagRemoved: "Tag \"{tag}\" removed"
</i18n>
