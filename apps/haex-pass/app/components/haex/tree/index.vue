<template>
  <div ref="scrollContainerRef" class="h-full bg-background border-r border-border">
    <ShadcnScrollArea class="h-full">
      <div class="p-2 space-y-1">
        <!-- Root navigation item -->
        <button
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors hover:bg-accent"
          :class="{ 'bg-accent': !currentGroupId }"
          @click="onSelectRoot"
        >
          <Icon name="mdi:safe" size="16" class="text-muted-foreground" />
          <span>{{ t('root') }}</span>
        </button>

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
    </ShadcnScrollArea>
  </div>
</template>

<script setup lang="ts">
import type { SelectHaexPasswordsGroups } from "~/database";

const { t } = useI18n();
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

const onSelectRoot = async () => {
  await navigateTo(
    localePath({
      name: "passwordGroupItems",
    })
  );
};

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

<i18n lang="yaml">
de:
  root: Alle Passwörter

en:
  root: All Passwords
</i18n>
