<script setup lang="ts">
import { ArrowDown, ArrowLeft, ArrowRight, ChevronsDown, RotateCw } from 'lucide-vue-next'

const emit = defineEmits<{
  left: []
  right: []
  down: []
  rotate: []
  drop: []
}>()
</script>

<template>
  <div class="flex flex-col items-center gap-2 pt-4 md:hidden">
    <div class="flex items-center gap-2">
      <ShadcnButton size="lg" variant="outline" class="w-14 h-14" @click="emit('rotate')">
        <RotateCw class="w-6 h-6" />
      </ShadcnButton>
    </div>
    <div class="flex items-center gap-2">
      <ShadcnButton size="lg" variant="outline" class="w-14 h-14" @click="emit('left')">
        <ArrowLeft class="w-6 h-6" />
      </ShadcnButton>
      <ShadcnButton size="lg" variant="outline" class="w-14 h-14" @click="emit('down')">
        <ArrowDown class="w-6 h-6" />
      </ShadcnButton>
      <ShadcnButton size="lg" variant="outline" class="w-14 h-14" @click="emit('right')">
        <ArrowRight class="w-6 h-6" />
      </ShadcnButton>
    </div>
    <ShadcnButton size="lg" variant="outline" class="w-full max-w-[11.5rem] h-12" @click="emit('drop')">
      <ChevronsDown class="w-6 h-6 mr-2" />
      Drop
    </ShadcnButton>
  </div>
</template>
