<template>
  <Icon v-if="!isCustomIcon" :icon="displayIcon" :class="iconClass" />
  <img
    v-else-if="customIconSrc"
    :src="customIconSrc"
    :alt="alt"
    :class="iconClass"
    class="inline-block"
  />
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue';

const props = defineProps<{
  icon?: string | null;
  alt?: string;
  class?: string;
}>();

const iconClass = computed(() => props.class || 'w-5 h-5');
const iconCacheStore = useIconCacheStore();

// Determine icon type and display value
const isCustomIcon = computed(() => {
  if (!props.icon) return false;
  return props.icon.startsWith('binary:');
});

const displayIcon = computed(() => {
  if (!props.icon) return 'mdi:key'; // Default icon

  // Custom binary icon
  if (props.icon.startsWith('binary:')) {
    return ''; // Will be handled by img tag
  }

  // Standard icon (e.g., "mdi:key")
  return props.icon;
});

// Extract hash from icon prop
const iconHash = computed(() => {
  if (!props.icon || !isCustomIcon.value) return null;
  return props.icon.replace('binary:', '');
});

// Get icon from cache
const customIconSrc = computed(() => {
  if (!iconHash.value) return null;
  return iconCacheStore.getIconDataUrl(iconHash.value);
});

// Request icon loading when hash changes
watch(iconHash, (hash) => {
  if (hash && !iconCacheStore.isCached(hash)) {
    iconCacheStore.requestIcon(hash);
  }
}, { immediate: true });
</script>
