<template>
  <div class="tags-input-wrapper relative">
    <ShadcnTagsInput
      v-model="model"
      class="group h-auto min-h-9 py-1.5 pr-9 transition-[color,box-shadow] focus-within:border-primary focus-within:ring-primary/50 focus-within:ring-[3px]"
    >
      <ShadcnTagsInputItem v-for="item in model" :key="item" :value="item">
        <ShadcnTagsInputItemText />
        <ShadcnTagsInputItemDelete />
      </ShadcnTagsInputItem>

      <input
        ref="inputRef"
        v-model="tagInput"
        :placeholder="placeholder"
        class="focus:outline-none flex-1 bg-transparent min-w-20"
        @keydown.enter.prevent="addTag"
        @keydown.down.prevent="onArrowDown"
        @keydown.up.prevent="onArrowUp"
        @keydown.escape="showSuggestions = false"
        @focus="onFocus"
        @blur="onBlur"
      >

      <ShadcnPopover :open="showSuggestions && filteredSuggestions.length > 0">
        <ShadcnPopoverAnchor :element="inputRef" />
        <ShadcnPopoverContent
          class="w-64 p-1"
          :side-offset="8"
          @open-auto-focus.prevent
          @interact-outside="showSuggestions = false"
        >
          <div class="max-h-48 overflow-y-auto">
            <button
              v-for="(tag, index) in filteredSuggestions"
              :key="tag.id"
              type="button"
              :class="[
                'w-full text-left px-2 py-1.5 text-sm rounded-sm flex items-center gap-2 transition-colors',
                index === highlightedIndex
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent hover:text-accent-foreground',
              ]"
              @click="selectSuggestion(tag)"
              @mouseenter="highlightedIndex = index"
            >
              <span
                v-if="tag.color"
                class="w-3 h-3 rounded-full shrink-0"
                :style="{ backgroundColor: tag.color }"
              />
              <span class="truncate">{{ tag.name }}</span>
            </button>
          </div>
        </ShadcnPopoverContent>
      </ShadcnPopover>
    </ShadcnTagsInput>

    <button
      v-show="tagInput.trim()"
      type="button"
      class="add-tag-button absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center size-9 rounded-md"
      @click="addTag"
    >
      <Plus class="size-4" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { Plus } from "lucide-vue-next";
import type { SelectHaexPasswordsTags } from "~/database";

defineProps<{
  placeholder?: string;
}>();

const model = defineModel<string[]>({ default: () => [] });

const tagInput = ref("");
const showSuggestions = ref(false);
const highlightedIndex = ref(0);
const inputRef = useTemplateRef<HTMLInputElement>("inputRef");

const { tags, syncTagsAsync, getOrCreateTagAsync } = useTagStore();

// Load tags on mount
onMounted(async () => {
  await syncTagsAsync();
});

// Filter suggestions based on input and exclude already selected tags
const filteredSuggestions = computed(() => {
  const input = tagInput.value.toLowerCase().trim();
  return tags
    .filter((tag) => {
      // Exclude already selected tags
      if (model.value.includes(tag.name)) return false;
      // If no input, show all available tags
      if (!input) return true;
      // Filter by input
      return tag.name.toLowerCase().includes(input);
    })
    .slice(0, 10); // Limit to 10 suggestions
});

// Show suggestions when input changes
watch(tagInput, () => {
  highlightedIndex.value = 0;
  showSuggestions.value = true;
});

const onFocus = () => {
  showSuggestions.value = true;
};

const onBlur = () => {
  // Delay hiding to allow click on suggestion
  setTimeout(() => {
    showSuggestions.value = false;
  }, 200);
};

const onArrowDown = () => {
  if (!showSuggestions.value && filteredSuggestions.value.length > 0) {
    showSuggestions.value = true;
    return;
  }
  if (highlightedIndex.value < filteredSuggestions.value.length - 1) {
    highlightedIndex.value++;
  }
};

const onArrowUp = () => {
  if (highlightedIndex.value > 0) {
    highlightedIndex.value--;
  }
};

const selectSuggestion = (tag: SelectHaexPasswordsTags) => {
  if (!model.value.includes(tag.name)) {
    model.value = [...model.value, tag.name];
  }
  tagInput.value = "";
  showSuggestions.value = false;
  highlightedIndex.value = 0;
  inputRef.value?.focus();
};

const addTag = async () => {
  // If suggestions are open and one is highlighted, select it
  if (
    showSuggestions.value &&
    filteredSuggestions.value.length > 0 &&
    highlightedIndex.value >= 0
  ) {
    const suggestion = filteredSuggestions.value[highlightedIndex.value];
    if (suggestion) {
      selectSuggestion(suggestion);
      return;
    }
  }

  // Otherwise add the typed tag
  const trimmed = tagInput.value.trim();
  if (trimmed && !model.value.includes(trimmed)) {
    // Create tag in database if it doesn't exist
    await getOrCreateTagAsync(trimmed);
    model.value = [...model.value, trimmed];
  }
  tagInput.value = "";
  showSuggestions.value = false;
};
</script>

<style scoped>
.add-tag-button {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
}

.add-tag-button:hover {
  background-color: rgba(0, 0, 0, 0.1);
}

:root.dark .add-tag-button:hover,
.dark .add-tag-button:hover {
  background-color: rgba(255, 255, 255, 0.1);
}
</style>
