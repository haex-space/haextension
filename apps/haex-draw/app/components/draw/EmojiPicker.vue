<script setup lang="ts">
import data from "@emoji-mart/data";
import { Picker } from "emoji-mart";

const emit = defineEmits<{
  select: [emoji: string];
  close: [];
}>();

const pickerRef = useTemplateRef<HTMLElement>("pickerRef");

onMounted(() => {
  if (!pickerRef.value) return;

  const picker = new Picker({
    data,
    onEmojiSelect: (emoji: any) => {
      emit("select", emoji.native);
    },
    theme: "dark",
    set: "native",
    previewPosition: "none",
    skinTonePosition: "search",
    maxFrequentRows: 2,
    perLine: 6,
    dynamicWidth: false,
  });

  pickerRef.value.appendChild(picker as unknown as Node);
});
</script>

<template>
  <div class="fixed inset-0 z-40" @click.self="emit('close')">
    <div
      ref="pickerRef"
      class="absolute left-[52px] top-0 h-full [&>em-emoji-picker]:h-full! [&>em-emoji-picker]:max-h-none! [&>em-emoji-picker]:border-0! [&>em-emoji-picker]:rounded-none!"
    />
  </div>
</template>
