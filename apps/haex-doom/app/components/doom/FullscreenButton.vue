<script setup lang="ts">
import { Maximize, Minimize } from '@lucide/vue'

defineProps<{ active: boolean }>()
const emit = defineEmits<{ toggle: [] }>()

const { t } = useI18n()
</script>

<template>
  <ShadcnButton
    variant="ghost"
    size="icon"
    class="absolute top-2 right-2 text-white/60 hover:text-white hover:bg-white/10"
    :aria-label="active ? t('leave') : t('enter')"
    @click.stop="emit('toggle')"
  >
    <Minimize
      v-if="active"
      class="size-5"
    />
    <Maximize
      v-else
      class="size-5"
    />
  </ShadcnButton>
</template>

<i18n lang="yaml">
de:
  enter: Vollbild
  leave: Vollbild beenden
en:
  enter: Fullscreen
  leave: Leave fullscreen
</i18n>
