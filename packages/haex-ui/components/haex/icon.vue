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
import { eq } from 'drizzle-orm';
import { haexPasswordsBinaries } from '~/database/schemas';

const props = defineProps<{
  icon?: string | null;
  alt?: string;
  class?: string;
}>();

const iconClass = computed(() => props.class || 'w-5 h-5');

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

// Load custom icon from database
const customIconSrc = ref<string | null>(null);
const { orm } = storeToRefs(useHaexHubStore());

watchEffect(async () => {
  if (!isCustomIcon.value || !props.icon || !orm.value) {
    customIconSrc.value = null;
    return;
  }

  try {
    // Extract hash from "binary:hash" format
    const hash = props.icon.replace('binary:', '');

    // Load binary from database
    const result = await orm.value
      .select()
      .from(haexPasswordsBinaries)
      .where(eq(haexPasswordsBinaries.hash, hash))
      .limit(1);

    if (result.length > 0 && result[0]?.data) {
      // Create data URL from base64
      customIconSrc.value = `data:image/png;base64,${result[0].data}`;
    }
  } catch (error) {
    console.error('[HaexIcon] Failed to load custom icon:', error);
    customIconSrc.value = null;
  }
});
</script>
