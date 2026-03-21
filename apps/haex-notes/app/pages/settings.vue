<script setup lang="ts">
import { ArrowLeft } from "lucide-vue-next";

const { t, locale, setLocale } = useI18n();
const router = useRouter();
const localePath = useLocalePath();
const haexVault = useHaexVaultStore();
const pencilCase = usePencilCaseStore();

const isLoaded = ref(false);

onMounted(async () => {
  await haexVault.initializeAsync();
  await pencilCase.loadAsync();
  isLoaded.value = true;
});

const goBack = () => router.back();

const onMaxSlotsChange = (val: number) => {
  pencilCase.setMaxSlots(val);
};
</script>

<template>
  <div v-if="isLoaded" class="flex h-full flex-col bg-background">
    <!-- Header -->
    <header class="flex items-center gap-3 border-b border-border px-4 py-3">
      <button
        class="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        @click="goBack"
      >
        <ArrowLeft class="size-5" />
      </button>
      <h1 class="text-lg font-semibold text-foreground">{{ t("title") }}</h1>
    </header>

    <!-- Settings Content -->
    <div class="flex-1 overflow-y-auto p-6">
      <div class="mx-auto max-w-lg flex flex-col gap-6">

        <!-- Pencil Case -->
        <div class="rounded-xl border border-border p-4">
          <h2 class="mb-3 text-sm font-semibold text-foreground">{{ t("pencilCase") }}</h2>

          <div class="flex items-center justify-between">
            <label class="text-sm text-muted-foreground">{{ t("maxSlots") }}</label>
            <div class="flex items-center gap-2">
              <input
                :value="pencilCase.maxSlots"
                type="range"
                :min="1"
                :max="20"
                class="w-32"
                @input="onMaxSlotsChange(Number(($event.target as HTMLInputElement).value))"
              />
              <span class="w-6 text-right text-sm tabular-nums text-foreground">{{ pencilCase.maxSlots }}</span>
            </div>
          </div>
        </div>

        <!-- Language -->
        <div class="rounded-xl border border-border p-4">
          <h2 class="mb-3 text-sm font-semibold text-foreground">{{ t("language") }}</h2>

          <div class="flex gap-2">
            <button
              class="rounded-lg px-4 py-2 text-sm transition-colors"
              :class="locale === 'de' ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-accent'"
              @click="setLocale('de')"
            >
              Deutsch
            </button>
            <button
              class="rounded-lg px-4 py-2 text-sm transition-colors"
              :class="locale === 'en' ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-accent'"
              @click="setLocale('en')"
            >
              English
            </button>
          </div>
        </div>

        <!-- About -->
        <div class="rounded-xl border border-border p-4">
          <h2 class="mb-2 text-sm font-semibold text-foreground">{{ t("about") }}</h2>
          <p class="text-xs text-muted-foreground">haex-notes v0.1.0</p>
          <p class="text-xs text-muted-foreground">{{ t("aboutDesc") }}</p>
        </div>

      </div>
    </div>
  </div>
</template>

<i18n lang="yaml">
de:
  title: Einstellungen
  pencilCase: Federkästchen
  maxSlots: Maximale Stift-Anzahl
  language: Sprache
  about: Über
  aboutDesc: Digitales Notizbuch für handschriftliche Notizen
en:
  title: Settings
  pencilCase: Pencil Case
  maxSlots: Maximum pen slots
  language: Language
  about: About
  aboutDesc: Digital notebook for handwritten notes
</i18n>
