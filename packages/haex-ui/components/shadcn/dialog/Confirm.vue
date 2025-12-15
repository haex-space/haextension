<template>
  <ShadcnAlertDialog v-model:open="isOpen">
    <ShadcnAlertDialogContent>
      <ShadcnAlertDialogHeader>
        <ShadcnAlertDialogTitle>{{ title }}</ShadcnAlertDialogTitle>
        <ShadcnAlertDialogDescription>
          {{ description }}
        </ShadcnAlertDialogDescription>
      </ShadcnAlertDialogHeader>
      <ShadcnAlertDialogFooter>
        <ShadcnAlertDialogCancel @click="$emit('abort')">
          {{ abortLabel }}
        </ShadcnAlertDialogCancel>
        <ShadcnAlertDialogAction @click="$emit('confirm')">
          {{ confirmLabel }}
        </ShadcnAlertDialogAction>
      </ShadcnAlertDialogFooter>
    </ShadcnAlertDialogContent>
  </ShadcnAlertDialog>
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
