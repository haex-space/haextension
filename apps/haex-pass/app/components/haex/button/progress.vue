<template>
  <UiButton
    variant="default"
    class="relative overflow-hidden"
    disabled
  >
    <svg
      class="w-5 h-5"
      viewBox="0 0 36 36"
    >
      <!-- Background circle -->
      <circle
        cx="18"
        cy="18"
        r="16"
        fill="currentColor"
        opacity="0.3"
      />
      <!-- Progress pie slice -->
      <path
        :d="progressPath"
        fill="currentColor"
        class="transition-all duration-300"
      />
    </svg>
  </UiButton>
</template>

<script setup lang="ts">
const props = defineProps<{
  progress: number; // 0-100
}>();

// Compute SVG path for circular progress (pie chart style, fills clockwise)
const progressPath = computed(() => {
  const percent = props.progress;
  if (percent <= 0) return "";
  if (percent >= 100) return "M 18 18 L 18 2 A 16 16 0 1 1 17.99 2 Z";

  const angle = (percent / 100) * 360;
  const radians = ((angle - 90) * Math.PI) / 180;
  const x = 18 + 16 * Math.cos(radians);
  const y = 18 + 16 * Math.sin(radians);
  const largeArc = angle > 180 ? 1 : 0;

  return `M 18 18 L 18 2 A 16 16 0 ${largeArc} 1 ${x} ${y} Z`;
});
</script>
