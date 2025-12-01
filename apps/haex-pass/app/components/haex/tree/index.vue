<template>
  <div ref="scrollContainerRef" class="h-full bg-background border-r border-border">
    <UiScrollArea class="h-full">
      <div class="p-2 space-y-1">
        <HaexTreeItem
          v-for="group in rootGroups"
          :key="group.id"
          :group="group"
          :level="0"
          :active-group-id="currentGroupId"
          @select="onSelectGroup"
          @delete="onDeleteGroup"
        />
      </div>
    </UiScrollArea>
  </div>
</template>

<script setup lang="ts">
import type { SelectHaexPasswordsGroups } from "~/database";

const { groups, currentGroupId } = storeToRefs(usePasswordGroupStore());
const localePath = useLocalePath();
const { treeScrollPosition } = useTreeExpanded();

// Get root level groups (groups with no parent)
const rootGroups = computed(() => {
  return groups.value.filter((g) => g.parentId === null);
});

const scrollContainerRef = ref<HTMLElement | null>(null);
let scrollViewport: HTMLElement | null = null;

// Find and setup scroll viewport
const setupScrollViewport = () => {
  if (!scrollContainerRef.value) return;

  // Find the ScrollAreaViewport element
  const viewport = scrollContainerRef.value.querySelector('[data-reka-scroll-area-viewport]') as HTMLElement;
  if (viewport && viewport !== scrollViewport) {
    scrollViewport = viewport;

    // Restore saved position
    viewport.scrollTop = treeScrollPosition.value;

    // Listen to scroll events
    viewport.addEventListener('scroll', () => {
      treeScrollPosition.value = viewport.scrollTop;
    });
  }
};

onMounted(() => {
  nextTick(() => {
    setupScrollViewport();
  });
});

// Restore scroll position after navigation
watch(currentGroupId, () => {
  nextTick(() => {
    if (scrollViewport) {
      scrollViewport.scrollTop = treeScrollPosition.value;
    } else {
      setupScrollViewport();
    }
  });
});

const onSelectGroup = async (groupId: string) => {
  await navigateTo(
    localePath({
      name: "passwordGroupItems",
      params: { groupId },
    })
  );
};

const onDeleteGroup = (group: SelectHaexPasswordsGroups) => {
  emit("delete", group);
};

const emit = defineEmits<{
  delete: [group: SelectHaexPasswordsGroups];
}>();
</script>
