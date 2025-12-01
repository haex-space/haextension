import type { IPasswordMenuItem } from "~/types/password";
import { getTableName } from "drizzle-orm";
import { haexPasswordsGroupItems, haexPasswordsItemDetails } from "~/database";

type ClipboardMode = "copy" | "cut" | null;

interface ClipboardItem {
  id: string;
  type: "group" | "item";
}

export const useSelectionStore = defineStore("selection", () => {
  const selectedItems = ref<Set<string>>(new Set());
  const isSelectionMode = ref(false);
  const clipboardItems = ref<ClipboardItem[]>([]);
  const clipboardMode = ref<ClipboardMode>(null);

  const selectedCount = computed(() => selectedItems.value.size);
  const hasClipboardItems = computed(() => clipboardItems.value.length > 0);

  // Get the actual prefixed table names from Drizzle
  const groupItemsTableName = getTableName(haexPasswordsGroupItems);
  const itemDetailsTableName = getTableName(haexPasswordsItemDetails);

  // Current visible group items (depends on current group and search)
  const currentGroupItems = computed<IPasswordMenuItem[]>(() => {
    const { currentGroupId, groups } = usePasswordGroupStore();
    const { items } = usePasswordItemStore();
    const { search, searchResults } = useSearchStore();

    const menuItems: IPasswordMenuItem[] = [];

    // When searching, only show groups if search is empty
    const filteredGroups = search
      ? [] // Don't show groups when searching
      : groups.filter(
          (group) => group.parentId == currentGroupId && group.id !== "trash"
        );

    const filteredItems = search
      ? searchResults || []
      : items.filter((item) => {
          const itemRecord = item as Record<string, Record<string, unknown>>;
          return itemRecord[groupItemsTableName]?.groupId == currentGroupId;
        });

    menuItems.push(
      ...filteredGroups.map<IPasswordMenuItem>((group) => ({
        color: group.color,
        icon: group.icon,
        id: group.id,
        name: group.name,
        type: "group",
      }))
    );

    menuItems.push(
      ...filteredItems.map<IPasswordMenuItem>((item) => {
        const itemRecord = item as Record<string, Record<string, unknown>>;
        const details = itemRecord[itemDetailsTableName];
        return {
          color: details?.color as string | null,
          icon: details?.icon as string | null,
          id: details?.id as string,
          name: details?.title as string | null,
          type: "item",
        };
      })
    );

    return menuItems;
  });

  const toggleSelection = (itemId: string) => {
    if (selectedItems.value.has(itemId)) {
      selectedItems.value.delete(itemId);
    } else {
      selectedItems.value.add(itemId);
    }

    // Exit selection mode if no items are selected
    if (selectedItems.value.size === 0) {
      isSelectionMode.value = false;
    }
  };

  const selectItem = (itemId: string) => {
    selectedItems.value.add(itemId);
    isSelectionMode.value = true;
  };

  const deselectItem = (itemId: string) => {
    selectedItems.value.delete(itemId);
    if (selectedItems.value.size === 0) {
      isSelectionMode.value = false;
    }
  };

  const clearSelection = () => {
    selectedItems.value.clear();
    isSelectionMode.value = false;
  };

  const selectAll = () => {
    // Use groupItems from useGroupItemsMenuStore as the source of truth
    // This respects screen size filtering (e.g., no folders on small screens)
    const { groupItems } = useGroupItemsMenuStore();
    groupItems.forEach((item) => selectedItems.value.add(item.id));
    isSelectionMode.value = true;
  };

  const isSelected = (itemId: string) => {
    return selectedItems.value.has(itemId);
  };

  const addToClipboard = (mode: "copy" | "cut") => {
    // Build ClipboardItem[] from selected IDs by looking up their types
    // Filter out trash folder - it cannot be moved/cut/copied
    clipboardItems.value = Array.from(selectedItems.value)
      .filter((id) => id !== "trash")
      .map((id) => {
        const menuItem = currentGroupItems.value.find((item) => item.id === id);
        return {
          id,
          type: menuItem?.type || "item",
        } as ClipboardItem;
      });
    clipboardMode.value = mode;
    clearSelection();
  };

  const copyToClipboard = () => {
    addToClipboard("copy");
  };

  const cutToClipboard = () => {
    addToClipboard("cut");
  };

  const clearClipboard = () => {
    clipboardItems.value = [];
    clipboardMode.value = null;
  };

  const isInClipboard = (itemId: string) => {
    return clipboardItems.value.some((item) => item.id === itemId);
  };

  const isCut = (itemId: string) => {
    return (
      clipboardMode.value === "cut" &&
      clipboardItems.value.some((item) => item.id === itemId)
    );
  };

  return {
    selectedItems,
    selectedCount,
    isSelectionMode,
    clipboardItems,
    clipboardMode,
    hasClipboardItems,
    currentGroupItems,
    toggleSelection,
    selectItem,
    deselectItem,
    clearSelection,
    selectAll,
    isSelected,
    copyToClipboard,
    cutToClipboard,
    clearClipboard,
    isInClipboard,
    isCut,
  };
});
