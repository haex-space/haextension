<script setup lang="ts">
const { t } = useI18n()

const ENGINE_SOURCE = 'https://github.com/fabiangreffrath/crispy-doom (commit fdeabe4c23a833534b70aa84a22f1685aae7125d, tag crispy-doom-7.2)'
const APP_SOURCE = 'https://github.com/haex-space/haextension (apps/haex-doom)'

const LICENSE_FILES = [
  { id: 'app', file: 'haex-doom-LICENSE.txt' },
  { id: 'freedoom', file: 'freedoom-COPYING.txt' },
  { id: 'shareware', file: 'doom-shareware-NOTICE.txt' },
  { id: 'sharewareReadme', file: 'doom-shareware-README.txt' },
] as const

const open = ref(false)
const texts = ref<Record<string, string>>({})

async function loadTexts() {
  const entries = await Promise.all(LICENSE_FILES.map(async ({ id, file }) => {
    const response = await fetch(new URL(`licenses/${file}`, document.baseURI))
    return [id, response.ok ? await response.text() : t('missing')] as const
  }))
  texts.value = Object.fromEntries(entries)
}

watch(open, (isOpen) => {
  if (isOpen && Object.keys(texts.value).length === 0) {
    loadTexts().catch((error: unknown) => console.error('[haex-doom] Could not load licence texts:', error))
  }
})
</script>

<template>
  <ShadcnDialog v-model:open="open">
    <ShadcnDialogTrigger as-child>
      <ShadcnButton variant="ghost">
        {{ t('about') }}
      </ShadcnButton>
    </ShadcnDialogTrigger>
    <ShadcnDialogContent class="max-w-2xl">
      <ShadcnDialogHeader>
        <ShadcnDialogTitle>{{ t('about') }}</ShadcnDialogTitle>
        <ShadcnDialogDescription>{{ t('summary') }}</ShadcnDialogDescription>
      </ShadcnDialogHeader>
      <ShadcnScrollArea class="h-[60vh] pr-3">
        <section class="space-y-2 text-sm">
          <p>{{ t('gpl') }}</p>
          <p class="select-text break-all">
            {{ t('engineSource') }}: {{ ENGINE_SOURCE }}
          </p>
          <p class="select-text break-all">
            {{ t('appSource') }}: {{ APP_SOURCE }}
          </p>
        </section>
        <section
          v-for="{ id } in LICENSE_FILES"
          :key="id"
          class="mt-6"
        >
          <h3 class="font-semibold mb-2">
            {{ t(`files.${id}`) }}
          </h3>
          <pre class="text-xs whitespace-pre-wrap select-text">{{ texts[id] }}</pre>
        </section>
      </ShadcnScrollArea>
    </ShadcnDialogContent>
  </ShadcnDialog>
</template>

<i18n lang="yaml">
de:
  about: Über
  summary: DOOM-Engine, Spieldaten und Lizenzen
  gpl: haex-doom steht unter der GNU General Public License, Version 2. Es nutzt die Engine Crispy DOOM von Fabian Greffrath und anderen, die auf Chocolate DOOM und dem 1997 veröffentlichten Quelltext von id Software beruht.
  engineSource: Quelltext der Engine
  appSource: Quelltext von haex-doom
  missing: (nicht gefunden)
  files:
    app: GNU General Public License, Version 2
    freedoom: Freedoom
    shareware: DOOM-Shareware
    sharewareReadme: DOOM-Shareware – README von id Software
en:
  about: About
  summary: DOOM engine, game data and licences
  gpl: haex-doom is licensed under the GNU General Public License, version 2. It uses the Crispy DOOM engine by Fabian Greffrath and others, based on Chocolate DOOM and the source code id Software released in 1997.
  engineSource: Engine source code
  appSource: haex-doom source code
  missing: (not found)
  files:
    app: GNU General Public License, version 2
    freedoom: Freedoom
    shareware: DOOM shareware
    sharewareReadme: DOOM shareware – README by id Software
</i18n>
