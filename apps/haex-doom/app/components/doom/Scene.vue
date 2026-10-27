<script setup lang="ts">
// Each ember rises on its own schedule; only transform and opacity animate.
const EMBERS = [
  { x: '8%', size: 3, duration: 11, delay: -2, drift: '24px' },
  { x: '19%', size: 2, duration: 14, delay: -9, drift: '-18px' },
  { x: '31%', size: 3, duration: 12, delay: -5, drift: '30px' },
  { x: '46%', size: 2, duration: 16, delay: -12, drift: '-26px' },
  { x: '58%', size: 4, duration: 13, delay: -7, drift: '16px' },
  { x: '69%', size: 2, duration: 15, delay: -1, drift: '-32px' },
  { x: '81%', size: 3, duration: 10, delay: -4, drift: '22px' },
  { x: '92%', size: 2, duration: 17, delay: -10, drift: '-14px' },
]
</script>

<template>
  <div
    class="doom-scene"
    aria-hidden="true"
  >
    <div class="doom-scene__glow" />
    <svg
      class="doom-scene__horizon"
      viewBox="0 0 1200 120"
      preserveAspectRatio="none"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="doom-lava"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop
            offset="0"
            stop-color="#ffb02e"
          />
          <stop
            offset="0.45"
            stop-color="#e2461a"
          />
          <stop
            offset="1"
            stop-color="#8a1409"
          />
        </linearGradient>
      </defs>
      <rect
        y="96"
        width="1200"
        height="24"
        fill="url(#doom-lava)"
      />
      <polygon
        fill="#070201"
        points="0,100 0,62 50,48 104,70 168,30 226,64 296,38 352,74 424,26 492,66 566,34 640,62 716,40 790,72 862,32 934,66 1004,44 1082,74 1140,50 1200,64 1200,100 1100,92 980,100 850,90 720,100 590,92 460,100 330,91 200,100 80,93"
      />
    </svg>
    <span
      v-for="(ember, index) in EMBERS"
      :key="index"
      class="doom-scene__ember"
      :style="{ '--x': ember.x, '--size': `${ember.size}px`, '--duration': `${ember.duration}s`, '--delay': `${ember.delay}s`, '--drift': ember.drift }"
    />
    <div class="doom-scene__vignette" />
  </div>
</template>
