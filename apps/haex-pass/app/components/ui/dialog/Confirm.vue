<template>
  <UiAlertDialog v-model:open="isOpen">
    <UiAlertDialogContent>
      <UiAlertDialogHeader>
        <UiAlertDialogTitle>{{ title }}</UiAlertDialogTitle>
        <UiAlertDialogDescription>
          {{ description }}
        </UiAlertDialogDescription>
      </UiAlertDialogHeader>
      <UiAlertDialogFooter>
        <UiAlertDialogCancel @click="$emit('abort')">
          {{ abortLabel }}
        </UiAlertDialogCancel>
        <UiAlertDialogAction @click="$emit('confirm')">
          {{ confirmLabel }}
        </UiAlertDialogAction>
      </UiAlertDialogFooter>
    </UiAlertDialogContent>
  </UiAlertDialog>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
  confirmLabel: string;
  abortLabel: string;
}>();

defineEmits<{
  confirm: [];
  abort: [];
}>();

const isOpen = defineModel<boolean>('open', { default: false });
</script>
