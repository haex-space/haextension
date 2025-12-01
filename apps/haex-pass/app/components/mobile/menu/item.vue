<template>
  <button
    class="flex gap-4 w-full px-4 py-3 cursor-pointer border-b transition-all hover:bg-accent/50 active:bg-accent"
    :style="{ color: menuItem.color ?? '' }"
    @click="$emit('click', menuItem)"
  >
    <UiIcon
      :icon="menuItem?.icon"
      :alt="menuItem?.name"
      class="shrink-0 w-6 h-6"
    />
    <p class="w-full flex-1 text-start truncate font-bold">
      {{ menuItem?.name }}
    </p>

    <Icon
      v-if="menuItem.type === 'group'"
      name="mdi:chevron-right"
      size="24"
      class="text-base-content"
    />
  </button>
</template>

<script setup lang="ts">
import type { IPasswordMenuItem } from "./types";

defineEmits<{ click: [group?: IPasswordMenuItem] }>();

const menuItem = defineProps<IPasswordMenuItem>();
</script>
