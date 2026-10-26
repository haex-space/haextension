<script setup lang="ts">
import { mapsFor } from '~/lib/maps'
import type { HostSettings } from '~/lib/lobby'
import type { LobbyMode, LobbyVisibility, TimeLimit } from '~/lib/lobbyProtocol'

const props = defineProps<{
  /** Opening the lobby is under way. */
  busy?: boolean
}>()

const emit = defineEmits<{
  open: [settings: HostSettings]
  cancel: []
}>()

const { t } = useI18n()
const games = useGamesStore()

const SKILLS = [1, 2, 3, 4, 5] as const

const gameId = ref(games.all[0]?.id ?? '')
const mode = ref<LobbyMode>('coop')
const map = ref('')
const skill = ref('3')
const monsters = ref(false)
const timeLimit = ref('10')
const visibility = ref<LobbyVisibility>('contacts')

const game = computed(() => games.all.find(candidate => candidate.id === gameId.value))
const maps = computed(() => (game.value ? mapsFor(game.value) : []))

// A game of the other family has other maps.
watch(maps, (list) => {
  if (!list.includes(map.value)) map.value = list[0] ?? ''
}, { immediate: true })

function open() {
  const chosen = game.value
  if (!chosen || props.busy) return
  const base = { game: chosen, visibility: visibility.value, map: map.value, skill: Number(skill.value) }
  emit('open', mode.value === 'deathmatch'
    ? { ...base, mode: 'deathmatch', monsters: monsters.value, timeLimit: Number(timeLimit.value) as TimeLimit }
    : { ...base, mode: 'coop' })
}
</script>

<template>
  <form
    class="flex flex-col gap-4 w-full"
    @submit.prevent="open"
  >
    <label class="flex flex-col gap-1">
      <span class="text-sm text-muted-foreground">{{ t('game') }}</span>
      <ShadcnSelect v-model="gameId">
        <ShadcnSelectTrigger class="w-full">
          <ShadcnSelectValue />
        </ShadcnSelectTrigger>
        <ShadcnSelectContent>
          <ShadcnSelectItem
            v-for="candidate in games.all"
            :key="candidate.id"
            :value="candidate.id"
          >
            {{ candidate.title }}
          </ShadcnSelectItem>
        </ShadcnSelectContent>
      </ShadcnSelect>
    </label>

    <div class="grid grid-cols-2 gap-3">
      <label class="flex flex-col gap-1">
        <span class="text-sm text-muted-foreground">{{ t('mode') }}</span>
        <ShadcnSelect v-model="mode">
          <ShadcnSelectTrigger class="w-full">
            <ShadcnSelectValue />
          </ShadcnSelectTrigger>
          <ShadcnSelectContent>
            <ShadcnSelectItem value="coop">
              {{ t('coop') }}
            </ShadcnSelectItem>
            <ShadcnSelectItem value="deathmatch">
              {{ t('deathmatch') }}
            </ShadcnSelectItem>
          </ShadcnSelectContent>
        </ShadcnSelect>
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-sm text-muted-foreground">{{ t('skill') }}</span>
        <ShadcnSelect v-model="skill">
          <ShadcnSelectTrigger class="w-full">
            <ShadcnSelectValue />
          </ShadcnSelectTrigger>
          <ShadcnSelectContent>
            <ShadcnSelectItem
              v-for="level in SKILLS"
              :key="level"
              :value="String(level)"
            >
              {{ t(`skills.${level}`) }}
            </ShadcnSelectItem>
          </ShadcnSelectContent>
        </ShadcnSelect>
      </label>
    </div>

    <label class="flex flex-col gap-1">
      <span class="text-sm text-muted-foreground">{{ t('map') }}</span>
      <ShadcnSelect v-model="map">
        <ShadcnSelectTrigger class="w-full">
          <ShadcnSelectValue />
        </ShadcnSelectTrigger>
        <ShadcnSelectContent>
          <ShadcnSelectItem
            v-for="name in maps"
            :key="name"
            :value="name"
          >
            {{ name }}
          </ShadcnSelectItem>
        </ShadcnSelectContent>
      </ShadcnSelect>
    </label>

    <template v-if="mode === 'deathmatch'">
      <label class="flex items-center justify-between gap-4">
        <span>{{ t('monsters') }}</span>
        <ShadcnSwitch v-model="monsters" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-sm text-muted-foreground">{{ t('timeLimit') }}</span>
        <ShadcnSelect v-model="timeLimit">
          <ShadcnSelectTrigger class="w-full">
            <ShadcnSelectValue />
          </ShadcnSelectTrigger>
          <ShadcnSelectContent>
            <ShadcnSelectItem value="0">
              {{ t('noLimit') }}
            </ShadcnSelectItem>
            <ShadcnSelectItem value="10">
              {{ t('minutes', { count: 10 }) }}
            </ShadcnSelectItem>
            <ShadcnSelectItem value="20">
              {{ t('minutes', { count: 20 }) }}
            </ShadcnSelectItem>
          </ShadcnSelectContent>
        </ShadcnSelect>
      </label>
    </template>

    <label class="flex flex-col gap-1">
      <span class="text-sm text-muted-foreground">{{ t('visibility') }}</span>
      <ShadcnSelect v-model="visibility">
        <ShadcnSelectTrigger class="w-full">
          <ShadcnSelectValue />
        </ShadcnSelectTrigger>
        <ShadcnSelectContent>
          <ShadcnSelectItem value="contacts">
            {{ t('contactsOnly') }}
          </ShadcnSelectItem>
          <ShadcnSelectItem value="public">
            {{ t('public') }}
          </ShadcnSelectItem>
        </ShadcnSelectContent>
      </ShadcnSelect>
      <span class="text-sm text-muted-foreground">
        {{ visibility === 'public' ? t('publicHint') : t('contactsHint') }}
      </span>
    </label>

    <div class="flex gap-2">
      <ShadcnButton
        type="button"
        variant="ghost"
        @click="emit('cancel')"
      >
        {{ t('cancel') }}
      </ShadcnButton>
      <ShadcnButton
        type="submit"
        class="flex-1"
        :disabled="busy || !game"
      >
        {{ busy ? t('opening') : t('openLobby') }}
      </ShadcnButton>
    </div>
  </form>
</template>

<i18n lang="yaml">
de:
  game: Spiel
  mode: Modus
  coop: Kooperativ
  deathmatch: Deathmatch
  skill: Schwierigkeit
  skills:
    "1": Ich bin zu jung zum Sterben
    "2": Nicht zu hart
    "3": Volles Programm
    "4": Ultra-Gewalt
    "5": Albtraum
  map: Karte
  monsters: Monster im Deathmatch
  timeLimit: Zeitlimit
  noLimit: Kein Limit
  minutes: "{count} Minuten"
  visibility: Wer darf beitreten?
  contactsOnly: Nur meine Kontakte
  public: Jeder mit dem Beitrittscode
  contactsHint: Nur Kontakte aus deinem Adressbuch können eingeladen werden oder mit dem Code beitreten.
  publicHint: Jeder mit dem Code kann beitreten. Direkt verbundene Mitspieler sehen die Netzwerkadresse deines Geräts.
  cancel: Abbrechen
  openLobby: Lobby öffnen
  opening: Wird geöffnet …
en:
  game: Game
  mode: Mode
  coop: Cooperative
  deathmatch: Deathmatch
  skill: Skill
  skills:
    "1": I'm too young to die
    "2": Hey, not too rough
    "3": Hurt me plenty
    "4": Ultra-Violence
    "5": Nightmare!
  map: Map
  monsters: Monsters in deathmatch
  timeLimit: Time limit
  noLimit: No limit
  minutes: "{count} minutes"
  visibility: Who may join?
  contactsOnly: My contacts only
  public: Anyone with the join code
  contactsHint: Only contacts from your address book can be invited or join with the code.
  publicHint: Anyone with the code can join. Directly connected players see your device's network address.
  cancel: Cancel
  openLobby: Open lobby
  opening: Opening …
</i18n>
