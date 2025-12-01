<template>
  <NuxtLayout name="passwords">
    <div class="flex-1 p-2">
      <UiItemGroup v-if="groupItems.length">
        <UiContextMenu v-for="item in groupItems" :key="item.id">
          <UiContextMenuTrigger as-child>
            <UiItem
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
              <UiItemMedia
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
              </UiItemMedia>
              <UiItemContent>
                <UiItemTitle>{{ item.name }}</UiItemTitle>
                <!-- Show username and URL on medium screens and up -->
                <UiItemDescription v-if="item.type === 'item'" class="hidden md:grid grid-cols-2 gap-4 text-xs">
                  <span class="flex items-center gap-1 truncate">
                    <User class="w-3 h-3 shrink-0" />
                    <span class="truncate">{{ item.username || '-' }}</span>
                  </span>
                  <span class="flex items-center gap-1 truncate">
                    <Globe class="w-3 h-3 shrink-0" />
                    <span class="truncate">{{ item.url || '-' }}</span>
                  </span>
                </UiItemDescription>
              </UiItemContent>
              <UiItemActions>
                <ChevronRight
                  v-if="item.type === 'group'"
                  class="w-4 h-4"
                />
              </UiItemActions>
            </UiItem>
          </UiContextMenuTrigger>

          <UiContextMenuContent>
            <template v-if="item.type === 'item'">
              <UiContextMenuItem @click="onCopyPassword(item)">
                <Copy class="w-4 h-4 mr-2" />
                {{ t("copyPassword") }}
                <UiContextMenuShortcut>Ctrl+C</UiContextMenuShortcut>
              </UiContextMenuItem>
              <UiContextMenuItem @click="onCopyUsername(item)">
                <User class="w-4 h-4 mr-2" />
                {{ t("copyUsername") }}
                <UiContextMenuShortcut>Ctrl+B</UiContextMenuShortcut>
              </UiContextMenuItem>
              <UiContextMenuItem @click="onOpenUrl(item)">
                <ExternalLink class="w-4 h-4 mr-2" />
                {{ t("openUrl") }}
                <UiContextMenuShortcut>Ctrl+U</UiContextMenuShortcut>
              </UiContextMenuItem>
              <UiContextMenuSeparator />
            </template>
            <UiContextMenuItem
              v-if="selectionStore.selectedCount <= 1"
              @click="onEditItem(item)"
            >
              <Edit class="w-4 h-4 mr-2" />
              {{ t("edit") }}
            </UiContextMenuItem>
            <UiContextMenuItem
              class="text-destructive focus:text-destructive"
              @click="onDeleteItem(item)"
            >
              <Trash class="w-4 h-4 mr-2" />
              {{ t("delete") }}
            </UiContextMenuItem>
          </UiContextMenuContent>
        </UiContextMenu>
      </UiItemGroup>
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
  User,
  ExternalLink,
  Globe,
} from "lucide-vue-next";
import type { IPasswordMenuItem } from "~/types/password";
import { onLongPress, onKeyStroke, useClipboard } from "@vueuse/core";

definePageMeta({
  name: "passwordGroupItems",
});

const { t } = useI18n();
const localePath = useLocalePath();

const { getTextColor } = useIconComponents();
const selectionStore = useSelectionStore();
const { groupItems } = storeToRefs(useGroupItemsMenuStore());
const { isMediumScreen } = storeToRefs(useUiStore());
const { currentGroupItems } = storeToRefs(usePasswordGroupStore());
const { copy } = useClipboard();

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

const onEditItem = async (item: IPasswordMenuItem) => {
  if (item.type === "group") {
    await navigateTo(
      localePath({
        name: "passwordGroupEdit",
        params: { groupId: item.id },
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

  selectionStore.clearSelection();
};

const onDeleteItem = (item: IPasswordMenuItem) => {
  const deleteDialogStore = useDeleteDialogStore();
  deleteDialogStore.deleteFromMobile(item);
};

// Item action handlers - use cached data for synchronous clipboard access
const onCopyPassword = (item: IPasswordMenuItem) => {
  const cachedItem = currentGroupItems.value.get(item.id);
  if (cachedItem?.resolvedPassword) {
    copy(cachedItem.resolvedPassword);
  }
};

const onCopyUsername = (item: IPasswordMenuItem) => {
  const cachedItem = currentGroupItems.value.get(item.id);
  if (cachedItem?.resolvedUsername) {
    copy(cachedItem.resolvedUsername);
  }
};

const onOpenUrl = (item: IPasswordMenuItem) => {
  const haexhubStore = useHaexVaultStore();
  const cachedItem = currentGroupItems.value.get(item.id);
  if (cachedItem?.details.url && haexhubStore.client?.web?.openAsync) {
    haexhubStore.client.web.openAsync(cachedItem.details.url);
  }
};

// Helper for keyboard shortcuts on selected item
const withSelectedItem = (
  event: KeyboardEvent,
  action: (item: IPasswordMenuItem) => void
) => {
  if ((event.ctrlKey || event.metaKey) && selectionStore.selectedCount === 1) {
    const selectedId = Array.from(selectionStore.selectedItems)[0];
    const selectedItem = groupItems.value.find((i) => i.id === selectedId);
    if (selectedItem?.type === "item") {
      event.preventDefault();
      action(selectedItem);
    }
  }
};

// Keyboard shortcuts for selected item (only on keydown to avoid double triggering)
onKeyStroke("c", (e) => withSelectedItem(e, onCopyPassword), {
  eventName: "keydown",
});
onKeyStroke("b", (e) => withSelectedItem(e, onCopyUsername), {
  eventName: "keydown",
});
onKeyStroke("u", (e) => withSelectedItem(e, onOpenUrl), {
  eventName: "keydown",
});
</script>

<i18n lang="yaml">
de:
  noItems: Keine Einträge vorhanden
  edit: Bearbeiten
  delete: Löschen
  copyPassword: Passwort kopieren
  copyUsername: Benutzername kopieren
  openUrl: URL öffnen

en:
  noItems: No items available
  edit: Edit
  delete: Delete
  copyPassword: Copy password
  copyUsername: Copy username
  openUrl: Open URL
</i18n>
