<template>
  <div
    class="min-h-[1.5em] break-all font-mono text-sm leading-relaxed tracking-wide select-all"
    :class="{ 'cursor-text': !readonly }"
    @click="$emit('click')"
  >
    <span v-for="(char, index) in characters" :key="index" :class="char.class">
      {{ char.value }}
    </span>
    <span v-if="!modelValue" class="text-muted-foreground">
      {{ placeholder }}
    </span>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue?: string | null;
  placeholder?: string;
  readonly?: boolean;
}>();

defineEmits<{
  click: [];
}>();

// Character classification
const getCharClass = (char: string): string => {
  // Digits
  if (/[0-9]/.test(char)) {
    return "text-blue-500 dark:text-blue-400";
  }
  // Lowercase letters
  if (/[a-z]/.test(char)) {
    return "text-foreground";
  }
  // Uppercase letters
  if (/[A-Z]/.test(char)) {
    return "text-green-600 dark:text-green-400";
  }
  // Special characters
  if (/[!@#$%^&*()_+\-=[]{};':"\\|,.<>\/?`~]/.test(char)) {
    return "text-amber-500 dark:text-amber-400";
  }
  // Spaces and other whitespace
  if (/\s/.test(char)) {
    return "text-muted-foreground bg-muted/50 rounded px-0.5";
  }
  // Default (other characters like umlauts, etc.)
  return "text-purple-500 dark:text-purple-400";
};

const characters = computed(() => {
  if (!props.modelValue) return [];

  return props.modelValue.split("").map((char) => ({
    value: char,
    class: getCharClass(char),
  }));
});
</script>
