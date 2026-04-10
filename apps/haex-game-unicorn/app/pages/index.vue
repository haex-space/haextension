<script setup lang="ts">
const gameContainer = ref<HTMLElement>()
const { mount, destroy, isReady } = useGame()

onMounted(() => {
  if (gameContainer.value) {
    mount(gameContainer.value)
  }
})

onUnmounted(() => {
  destroy()
})
</script>

<template>
  <div class="h-screen w-screen flex items-center justify-center bg-black">
    <div
      ref="gameContainer"
      class="w-full h-full"
    />
    <div
      v-if="!isReady"
      class="absolute inset-0 flex items-center justify-center bg-black"
    >
      <div class="text-white/60 text-sm">
        Loading...
      </div>
    </div>
  </div>
</template>
