<template>
  <div class="tags-input-wrapper relative">
    <ShadcnTagsInput v-model="model" class="h-auto min-h-9 pr-10 py-2">
      <ShadcnTagsInputItem v-for="item in model" :key="item" :value="item">
        <ShadcnTagsInputItemText />
        <ShadcnTagsInputItemDelete />
      </ShadcnTagsInputItem>
      <input
        :value="tagInput"
        :placeholder="placeholder"
        class="focus:outline-none flex-1 bg-transparent min-w-20"
        @input="tagInput = ($event.target as HTMLInputElement).value"
        @keydown.enter.prevent="addTag"
      />
    </ShadcnTagsInput>
    <UiButton
      v-show="tagInput.trim()"
      type="button"
      :icon="Plus"
      variant="ghost"
      class="absolute right-0 bottom-0"
      @click="addTag"
    />
  </div>
</template>

<script setup lang="ts">
import { Plus } from "lucide-vue-next";

defineProps<{
  placeholder?: string;
}>();

const model = defineModel<string[]>({ default: () => [] });

const tagInput = ref("");

const addTag = () => {
  const trimmed = tagInput.value.trim();
  if (trimmed && !model.value.includes(trimmed)) {
    model.value = [...model.value, trimmed];
  }
  tagInput.value = "";
};
</script>

<style scoped>
.tags-input-wrapper [data-slot="button"] {
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
}

.tags-input-wrapper [data-slot="button"]:hover {
  background-color: rgba(255, 255, 255, 0.1) !important;
}
</style>
