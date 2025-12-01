<template>
  <div>
    <UiContextMenu>
      <UiContextMenuTrigger as-child>
        <div
          ref="treeItemRef"
          :class="[
            'flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors hover:bg-accent',
            {
              'bg-accent font-medium': isActive,
              'opacity-50': isDragging,
              'bg-primary/10 border-2 border-primary border-dashed':
                isDropTarget,
              'bg-primary/20 border border-primary': isSelected,
            },
          ]"
          :style="{ paddingLeft: `${level * 30 + 8}px` }"
          draggable="true"
          @click="onClickAsync"
          @dragstart="onDragStart"
          @dragend="onDragEnd"
          @dragover.prevent="onDragOver"
          @dragleave="onDragLeave"
          @drop.prevent="onDrop"
        >
          <!-- Folder Icon - Click to toggle -->
          <div
            class="flex items-center justify-center w-8 h-8 rounded hover:bg-accent-foreground/10"
            :style="group.color ? { backgroundColor: group.color } : undefined"
            @click.stop="hasChildren && toggleExpand()"
          >
            <HaexIcon
              :icon="folderIcon"
              class="w-5 h-5"
              :style="
                group.color ? { color: getTextColor(group.color) } : undefined
              "
            />
          </div>

          <!-- Folder Name -->
          <span class="flex-1 text-sm truncate">{{ group.name }}</span>

          <!-- Chevron indicator for folders with children - Click to toggle -->
          <ChevronRight
            v-if="hasChildren"
            class="w-4 h-4 text-muted-foreground transition-transform duration-200 cursor-pointer hover:text-foreground"
            :class="{ 'rotate-90': isExpanded }"
            @click.stop="toggleExpand()"
          />
        </div>
      </UiContextMenuTrigger>

      <UiContextMenuContent>
        <UiContextMenuItem @click="onEditAsync">
          <Edit class="w-4 h-4 mr-2" />
          {{ $t("edit") }}
        </UiContextMenuItem>
        <UiContextMenuItem
          class="text-destructive focus:text-destructive"
          @click="onDeleteAsync"
        >
          <Trash class="w-4 h-4 mr-2" />
          {{ $t("delete") }}
        </UiContextMenuItem>
      </UiContextMenuContent>
    </UiContextMenu>

    <!-- Children -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0 max-h-0"
      enter-to-class="opacity-100 max-h-screen"
      leave-from-class="opacity-100 max-h-screen"
      leave-to-class="opacity-0 max-h-0"
    >
      <div v-if="isExpanded && hasChildren" class="overflow-hidden">
        <HaexTreeItem
          v-for="child in children"
          :key="child.id"
          :group="child"
          :level="level + 1"
          :active-group-id="activeGroupId"
          @select="$emit('select', $event)"
          @delete="$emit('delete', $event)"
        />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ChevronRight, Edit, Trash } from "lucide-vue-next";
import type { SelectHaexPasswordsGroups } from "~/database";

const props = defineProps<{
  group: SelectHaexPasswordsGroups;
  level: number;
  activeGroupId?: string | null;
}>();

const emit = defineEmits<{
  select: [groupId: string];
  edit: [groupId: string];
  delete: [group: SelectHaexPasswordsGroups];
}>();

const { groups } = storeToRefs(usePasswordGroupStore());
const { getTextColor } = useIconComponents();
const {
  isExpanded: isGroupExpanded,
  setExpanded,
  toggleExpanded: toggleGroupExpanded,
} = useTreeExpanded();

// Check if this group has children
const children = computed(() => {
  return groups.value.filter((g) => g.parentId === props.group.id);
});

const hasChildren = computed(() => children.value.length > 0);

// Track expand/collapse state using global composable
const isExpanded = computed(() => isGroupExpanded(props.group.id));

// Folder icon based on expanded state
const folderIcon = computed(() => {
  // If a custom icon is set (not default folder icons), always use it
  if (
    props.group.icon &&
    props.group.icon !== "mdi:folder" &&
    props.group.icon !== "mdi:folder-open" &&
    props.group.icon !== null
  ) {
    return props.group.icon;
  }

  // For default folder icons, switch between open/closed based on state
  return isExpanded.value && hasChildren.value
    ? "mdi:folder-open"
    : "mdi:folder";
});

// Check if this group is currently active
const isActive = computed(() => props.activeGroupId === props.group.id);

// Check if this group is selected
const isSelected = computed(() => selectionStore.isSelected(props.group.id));

// Auto-expand if this group or any of its children are active
// This only opens folders when needed, never closes them automatically
watch(
  () => props.activeGroupId,
  (newActiveId) => {
    if (!newActiveId) return;

    // Check if any child is active
    const hasActiveChild = (groupId: string): boolean => {
      const childGroups = groups.value.filter((g) => g.parentId === groupId);
      return childGroups.some(
        (child) => child.id === newActiveId || hasActiveChild(child.id)
      );
    };

    // Only expand, never collapse automatically
    if (props.group.id === newActiveId || hasActiveChild(props.group.id)) {
      setExpanded(props.group.id, true);
    }
    // Note: We don't set isExpanded to false when navigating away
    // Users must manually collapse folders by clicking on them
  },
  { immediate: true }
);

const toggleExpand = () => {
  toggleGroupExpanded(props.group.id);
};

const treeItemRef = useTemplateRef<HTMLElement>("treeItemRef");
const router = useRouter();
const localePath = useLocalePath();
const selectionStore = useSelectionStore();

const onClickAsync = async (event: MouseEvent) => {
  // Only enable selection mode in tree view with explicit Ctrl/Cmd
  // Normal clicks should always navigate, clearing any item selection
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    event.stopPropagation();
    selectionStore.isSelectionMode = true;
    selectionStore.toggleSelection(props.group.id);
    return;
  }

  // Clear any existing selection and exit selection mode when navigating
  if (selectionStore.selectedCount > 0) {
    selectionStore.clearSelection();
  }

  // Normal navigation
  emit("select", props.group.id);
};

const onEditAsync = async () => {
  // If single selection, edit that item
  if (selectionStore.selectedCount === 1) {
    const selectedId = Array.from(selectionStore.selectedItems)[0];
    await router.push(
      localePath({
        name: "passwordGroupEdit",
        params: { groupId: selectedId },
      })
    );
    selectionStore.clearSelection();
  } else {
    // Edit current group
    await router.push(
      localePath({
        name: "passwordGroupEdit",
        params: { groupId: props.group.id },
      })
    );
  }
};

const onDeleteAsync = () => {
  emit("delete", props.group);
};

// Drag & Drop state
const isDragging = ref(false);
const isDropTarget = ref(false);

const onDragStart = (event: DragEvent) => {
  if (!event.dataTransfer) return;

  isDragging.value = true;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", props.group.id);
};

const onDragEnd = () => {
  isDragging.value = false;
};

const onDragOver = (event: DragEvent) => {
  if (!event.dataTransfer) return;

  const draggedId = event.dataTransfer.types.includes("text/plain");
  if (!draggedId) return;

  // Prevent dropping on itself
  event.dataTransfer.dropEffect = "move";
  isDropTarget.value = true;
};

const onDragLeave = () => {
  isDropTarget.value = false;
};

const onDrop = async (event: DragEvent) => {
  if (!event.dataTransfer) return;

  isDropTarget.value = false;

  const draggedGroupId = event.dataTransfer.getData("text/plain");
  const targetGroupId = props.group.id;

  // Prevent dropping on itself
  if (draggedGroupId === targetGroupId) return;

  // Prevent dropping a parent into its own child
  const isChildOf = (parentId: string, childId: string): boolean => {
    const childGroups = groups.value.filter((g) => g.parentId === parentId);
    return childGroups.some(
      (child) => child.id === childId || isChildOf(child.id, childId)
    );
  };

  if (isChildOf(draggedGroupId, targetGroupId)) {
    console.warn("Cannot move a parent folder into its own child");
    return;
  }

  // Update the group's parent
  const { updateAsync, syncGroupItemsAsync } = usePasswordGroupStore();
  const draggedGroup = groups.value.find((g) => g.id === draggedGroupId);

  if (draggedGroup) {
    await updateAsync({
      ...draggedGroup,
      parentId: targetGroupId,
    });

    // Sync to update the UI immediately
    await syncGroupItemsAsync();

    // Expand the target folder to show the moved item
    setExpanded(props.group.id, true);
  }
};
</script>

<i18n lang="yaml">
de:
  edit: Bearbeiten
  delete: Löschen

en:
  edit: Edit
  delete: Delete
</i18n>
