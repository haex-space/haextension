<script setup lang="ts">
const props = defineProps<{
  brushId: string;
  size?: number;
  color?: string;
}>();

const s = computed(() => props.size ?? 20);
const c = computed(() => props.color ?? "currentColor");
</script>

<template>
  <svg :width="s" :height="s" :viewBox="`0 0 24 24`" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Bleistift: dünne texturierte Linie -->
    <template v-if="brushId === 'pencil'">
      <path d="M4 18 L8 14 L12 16 L16 10 L20 6" :stroke="c" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="5" cy="17" r="0.5" :fill="c" opacity="0.4" />
      <circle cx="10" cy="15" r="0.4" :fill="c" opacity="0.3" />
      <circle cx="15" cy="11" r="0.5" :fill="c" opacity="0.4" />
    </template>

    <!-- Kugelschreiber: saubere gleichmäßige Linie -->
    <template v-else-if="brushId === 'ballpoint'">
      <path d="M5 19 C7 13, 10 11, 12 14 C14 17, 17 9, 19 5" :stroke="c" stroke-width="2" stroke-linecap="round" fill="none" />
    </template>

    <!-- Filzstift: breite deckende Linie -->
    <template v-else-if="brushId === 'felt-tip'">
      <path d="M4 17 Q8 11, 12 14 T20 7" :stroke="c" stroke-width="3.5" stroke-linecap="round" fill="none" />
    </template>

    <!-- Textmarker: breiter halbtransparenter Strich -->
    <template v-else-if="brushId === 'marker'">
      <rect x="3" y="9" width="18" height="6" rx="1" :fill="c" opacity="0.35" />
      <path d="M4 12 L20 12" :stroke="c" stroke-width="5" stroke-linecap="butt" opacity="0.3" />
    </template>

    <!-- Fineliner: dünne gleichmäßige Linie -->
    <template v-else-if="brushId === 'fine-tip'">
      <path d="M5 19 C7 13, 10 11, 12 14 C14 17, 17 9, 19 5" :stroke="c" stroke-width="1.2" stroke-linecap="round" fill="none" />
    </template>

    <!-- Kalligrafie: dicke/dünne Wechsel -->
    <template v-else-if="brushId === 'calligraphy'">
      <path d="M4 18 C6 18, 7 8, 10 12 S14 4, 16 10 S19 6, 20 6" :stroke="c" stroke-width="0.6" stroke-linecap="round" fill="none" />
      <path d="M4 18 C6 18, 7 8, 10 12 S14 4, 16 10 S19 6, 20 6" :fill="c" opacity="0.6">
        <animate attributeName="d" values="M4 18 C6 18, 7 8, 10 12 S14 4, 16 10 S19 6, 20 6" dur="0s" />
      </path>
      <!-- Calligraphy: show thick-thin variation with a filled shape -->
      <path d="M4 19 Q6 17, 8 12 Q9 9, 10 12 Q11 15, 12 11 Q14 5, 16 10 Q18 7, 20 6 L20 7 Q18 8, 16 11 Q14 7, 12 12 Q11 16, 10 13 Q9 11, 8 13 Q6 18, 4 20 Z" :fill="c" opacity="0.8" />
    </template>

    <!-- Pinsel: weicher Strich mit Taper -->
    <template v-else-if="brushId === 'brush'">
      <path d="M3 20 Q5 17, 7 14 Q9 9, 12 12 Q15 15, 17 8 Q19 4, 21 3 L21 5 Q19 7, 17 10 Q15 16, 12 13 Q9 10, 7 16 Q5 19, 3 21 Z" :fill="c" />
    </template>

    <!-- Wasserfarbe: weicher Blob -->
    <template v-else-if="brushId === 'watercolor'">
      <ellipse cx="12" cy="12" rx="8" ry="5" :fill="c" opacity="0.15" />
      <ellipse cx="12" cy="12" rx="6" ry="3.5" :fill="c" opacity="0.2" />
      <ellipse cx="11" cy="12" rx="4" ry="2.5" :fill="c" opacity="0.25" />
    </template>

    <!-- Kreide: breiter, körniger Strich wie ein Kreidebalken -->
    <template v-else-if="brushId === 'chalk'">
      <!-- Breiter rauer Strich-Körper -->
      <path d="M4 17 Q8 13, 12 14 T20 8" :stroke="c" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.3" />
      <path d="M4 17 Q8 12, 12 14 T20 8" :stroke="c" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.4" />
      <!-- Körnige Textur-Lücken -->
      <rect x="6" y="14" width="1.5" height="1" rx="0.3" fill="white" opacity="0.5" transform="rotate(-8 6 14)" />
      <rect x="10" y="12" width="1.8" height="0.8" rx="0.3" fill="white" opacity="0.4" transform="rotate(5 10 12)" />
      <rect x="14" y="11" width="1.2" height="1" rx="0.3" fill="white" opacity="0.5" transform="rotate(-12 14 11)" />
      <rect x="17" y="9" width="1.5" height="0.7" rx="0.3" fill="white" opacity="0.4" transform="rotate(8 17 9)" />
    </template>

    <!-- Sprühfarbe: Airbrush-Wolke -->
    <template v-else-if="brushId === 'spray'">
      <circle cx="12" cy="12" r="6" :fill="c" opacity="0.15" />
      <circle cx="12" cy="12" r="4" :fill="c" opacity="0.25" />
      <circle cx="12" cy="12" r="2" :fill="c" opacity="0.5" />
      <ellipse cx="9" cy="10" rx="1" ry="0.8" :fill="c" opacity="0.6" transform="rotate(25 9 10)" />
      <ellipse cx="15" cy="14" rx="0.8" ry="0.6" :fill="c" opacity="0.5" transform="rotate(-20 15 14)" />
      <ellipse cx="14" cy="9" rx="0.7" ry="0.5" :fill="c" opacity="0.5" transform="rotate(40 14 9)" />
      <ellipse cx="10" cy="15" rx="0.6" ry="0.8" :fill="c" opacity="0.4" transform="rotate(-35 10 15)" />
      <ellipse cx="8" cy="13" rx="0.7" ry="0.5" :fill="c" opacity="0.35" />
      <ellipse cx="16" cy="11" rx="0.6" ry="0.7" :fill="c" opacity="0.35" />
    </template>

    <!-- Gestrichelt: Strichlinie -->
    <template v-else-if="brushId === 'dashed'">
      <path d="M4 17 L8 13 L12 15 L16 9 L20 6" :stroke="c" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="3 2.5" fill="none" />
    </template>

    <!-- Skizze: mehrere leicht versetzte Linien -->
    <template v-else-if="brushId === 'sketch'">
      <path d="M5 19 C7 13, 10 11, 12 14 C14 17, 17 9, 19 5" :stroke="c" stroke-width="1" stroke-linecap="round" fill="none" opacity="0.8" />
      <path d="M4 20 C6 14, 9 12, 11 15 C13 18, 16 10, 18 6" :stroke="c" stroke-width="1" stroke-linecap="round" fill="none" opacity="0.6" />
      <path d="M6 19 C8 13, 11 11, 13 14 C15 17, 18 9, 20 5" :stroke="c" stroke-width="0.8" stroke-linecap="round" fill="none" opacity="0.5" />
    </template>

    <!-- Radierer -->
    <template v-else-if="brushId === 'eraser'">
      <rect x="4" y="8" width="16" height="10" rx="2" :stroke="c" stroke-width="1.2" fill="none" />
      <line x1="4" y1="13" x2="20" y2="13" :stroke="c" stroke-width="0.8" opacity="0.4" />
      <rect x="4" y="13" width="16" height="5" rx="0 0 2 2" :fill="c" opacity="0.2" />
    </template>

    <!-- Fallback -->
    <template v-else>
      <path d="M4 18 L20 6" :stroke="c" stroke-width="1.5" stroke-linecap="round" />
    </template>
  </svg>
</template>
