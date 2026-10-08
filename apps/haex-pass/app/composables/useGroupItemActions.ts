import { useClipboard, useEventListener } from "@vueuse/core";
import { toast } from "vue-sonner";
import type { IPasswordMenuItem } from "~/types/password";

export function useGroupItemActions(
  t: (key: string, named?: Record<string, unknown>) => string
) {
  const localePath = useLocalePath();
  const selectionStore = useSelectionStore();
  const { groupItems } = storeToRefs(useGroupItemsMenuStore());
  const { currentGroupItems, currentGroup } = storeToRefs(usePasswordGroupStore());
  const { inTrashGroup: isInTrash } = storeToRefs(useGroupTreeStore());
  const { copy } = useClipboard();

  const onEditItem = async (item: IPasswordMenuItem) => {
    if (item.type === "group") {
      await navigateTo({
        path: localePath({
          name: "passwordGroupEdit",
          params: { groupId: item.id },
        }),
        query: { edit: "true" },
      });
    } else {
      await navigateTo({
        path: localePath({
          name: "passwordItemEdit",
          params: { ...useRouter().currentRoute.value.params, itemId: item.id },
        }),
        query: { edit: "true" },
      });
    }

    selectionStore.clearSelection();
  };

  const onDeleteItem = (item: IPasswordMenuItem) => {
    const deleteDialogStore = useDeleteDialogStore();
    deleteDialogStore.deleteFromMobile(item);
  };

  const onRestoreItem = async (item: IPasswordMenuItem) => {
    const { restoreAsync, syncItemsAsync } = usePasswordItemStore();
    const { restoreGroupAsync, syncGroupItemsAsync } = usePasswordGroupStore();

    if (item.type === "group") {
      await restoreGroupAsync(item.id);
      await syncGroupItemsAsync();
    } else {
      await restoreAsync(item.id);
      await syncItemsAsync();
    }

    selectionStore.clearSelection();
  };

  // Clone via store
  const cloneStore = useGroupItemsCloneStore();

  const onCloneItem = (item: IPasswordMenuItem) => {
    cloneStore.openCloneDialog([item.id], currentGroup.value?.id ?? null, t("cloneSuffix"), item.name);
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

  const onCopyUrl = (item: IPasswordMenuItem) => {
    const cachedItem = currentGroupItems.value.get(item.id);
    if (cachedItem?.details.url) {
      copy(cachedItem.details.url);
    }
  };

  const onDownloadFavicon = async (item: IPasswordMenuItem) => {
    const { downloadAndSetFaviconAsync } = useFavicon();
    const { syncGroupItemsAsync } = usePasswordGroupStore();

    // Get all selected items (or just the clicked item if none selected)
    const itemIds =
      selectionStore.selectedCount > 0
        ? Array.from(selectionStore.selectedItems)
        : [item.id];

    let successCount = 0;
    let failCount = 0;

    for (const itemId of itemIds) {
      const cachedItem = currentGroupItems.value.get(itemId);
      if (!cachedItem?.details.url) {
        failCount++;
        continue;
      }

      const success = await downloadAndSetFaviconAsync(
        itemId,
        cachedItem.details.url
      );
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    // Sync to update UI
    await syncGroupItemsAsync();

    if (successCount > 0 && failCount === 0) {
      toast.success(t("faviconSuccess", { count: successCount }));
    } else if (successCount > 0 && failCount > 0) {
      toast.warning(
        t("faviconPartial", { success: successCount, fail: failCount })
      );
    } else {
      toast.error(t("faviconFailed"));
    }
  };

  const onOpenUrl = async (item: IPasswordMenuItem) => {
    const haexVaultStore = useHaexVaultStore();
    const cachedItem = currentGroupItems.value.get(item.id);
    if (cachedItem?.details.url && haexVaultStore.client?.web?.openAsync) {
      try {
        await haexVaultStore.client.web.openAsync(cachedItem.details.url);
      } catch (error) {
        const err = error as { code?: number; message?: string };
        if (err.code === 1004) {
          // Permission prompt required - not an error, just info
          toast.info(t("urlPermissionRequired"));
        } else if (err.code === 2005) {
          // Invalid URL scheme
          toast.error(t("urlInvalid"), { description: err.message });
        } else {
          toast.error(t("urlOpenFailed"), { description: err.message });
        }
      }
    }
  };

  // Helper to get the selected item for shortcuts
  const getSelectedItem = () => {
    if (selectionStore.selectedCount !== 1) return null;
    const selectedId = Array.from(selectionStore.selectedItems)[0];
    const selectedItem = groupItems.value.find((i) => i.id === selectedId);
    return selectedItem?.type === "item" ? selectedItem : null;
  };

  // Helper to check if we're in an input field
  const isInInputField = () => {
    const el = document.activeElement;
    if (!el) return false;
    return (
      el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      (el as HTMLElement).isContentEditable
    );
  };

  // Keyboard shortcuts for selected items
  useEventListener(document, "keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || isInInputField()) return;

    const item = getSelectedItem();
    if (!item) return;

    switch (e.key.toLowerCase()) {
      case "c":
        e.preventDefault();
        onCopyPassword(item);
        break;
      case "b":
        e.preventDefault();
        onCopyUsername(item);
        break;
      case "u":
        e.preventDefault();
        if (e.shiftKey) {
          onOpenUrl(item);
        } else {
          onCopyUrl(item);
        }
        break;
      case "k":
        if (!isInTrash.value) {
          e.preventDefault();
          onCloneItem(item);
        }
        break;
    }
  });

  return {
    onEditItem,
    onDeleteItem,
    onRestoreItem,
    onCloneItem,
    onCopyPassword,
    onCopyUsername,
    onCopyUrl,
    onDownloadFavicon,
    onOpenUrl,
  };
}
