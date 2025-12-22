<template>
  <ShadcnTooltipProvider>
    <ShadcnTooltip>
      <ShadcnTooltipTrigger as-child>
        <slot />
      </ShadcnTooltipTrigger>
      <ShadcnTooltipContent>
        <slot name="content">
          <p>{{ tooltip }}</p>
        </slot>
      </ShadcnTooltipContent>
    </ShadcnTooltip>
  </ShadcnTooltipProvider>
</template>

<script setup lang="ts">
defineProps<{
  tooltip?: string;
}>();
</script>
