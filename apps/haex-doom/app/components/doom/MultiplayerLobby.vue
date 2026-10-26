<script setup lang="ts">
import { X } from '@lucide/vue'
import { toast } from 'vue-sonner'
import type { HostSettings } from '~/lib/lobby'
import type { InvitableContact } from '~/lib/contacts'
import { prepareNetAudio } from '~/lib/netAudio'

defineEmits<{ close: [] }>()

const { t } = useI18n()
const lobby = useLobbyStore()
const opening = ref(false)

async function openLobby(settings: HostSettings) {
  // The game later starts without a tap of its own; its audio is unlocked here (research R-14).
  prepareNetAudio()
  opening.value = true
  const result = await lobby.openLobby(settings)
  opening.value = false
  if (result !== 'ok') toast.error(t(`openFailed.${result}`))
}

watch(() => lobby.role, (role) => {
  if (role === 'host') void lobby.loadContacts()
}, { immediate: true })

const MAX_GUESTS = 3
const slotsFree = computed(() => lobby.players.length + lobby.invites.filter(invite => invite.status === 'pending').length < MAX_GUESTS)

function statusOf(contact: InvitableContact) {
  return lobby.invites.find(invite => invite.contactId === contact.id)
}

function canInvite(contact: InvitableContact) {
  const status = statusOf(contact)?.status
  return slotsFree.value && status !== 'pending' && status !== 'accepted'
}

async function invite(contact: InvitableContact) {
  const result = await lobby.invite(contact)
  if (result !== 'ok') toast.error(t(`inviteFailed.${result}`))
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(lobby.joinCode ?? '')
    toast.success(t('copied'))
  } catch (error) {
    console.error('[haex-doom] Could not copy the join code:', error)
    toast.error(t('copyFailed'))
  }
}

async function start() {
  prepareNetAudio()
  const result = await lobby.startGame()
  if (result !== 'ok') toast.error(t(`startFailed.${result}`))
}

const summary = computed(() => {
  const current = lobby.role === 'host' ? lobby.settings : lobby.guestView
  if (!current) return null
  const game = 'game' in current ? current.game : null
  return game
    ? { title: game.title, mode: current.mode, map: current.map, skill: current.skill }
    : null
})
</script>

<template>
  <div class="flex flex-col gap-4 w-full">
    <h2 class="text-xl font-bold">
      {{ t('title') }}
    </h2>

    <DoomLobbySetup
      v-if="lobby.role === 'none' || lobby.phase === 'opening'"
      :busy="opening"
      @open="openLobby"
      @cancel="$emit('close')"
    />

    <p
      v-else-if="lobby.phase === 'joining'"
      class="text-muted-foreground"
    >
      {{ t('joining') }}
    </p>

    <template v-else>
      <p
        v-if="summary"
        class="text-muted-foreground"
      >
        {{ t('summary', { game: summary.title, mode: t(summary.mode), map: summary.map, skill: summary.skill }) }}
      </p>

      <div
        v-if="lobby.role === 'host' && lobby.joinCode"
        class="flex flex-col gap-1"
      >
        <span class="text-sm text-muted-foreground">{{ t('joinCode') }}</span>
        <div class="flex gap-2 items-center">
          <code class="flex-1 min-w-0 truncate rounded-md border px-3 py-2 text-sm select-text">{{ lobby.joinCode }}</code>
          <ShadcnButton
            variant="secondary"
            @click="copyCode"
          >
            {{ t('copy') }}
          </ShadcnButton>
        </div>
      </div>

      <section class="flex flex-col gap-2">
        <h3 class="font-semibold">
          {{ t('players') }}
        </h3>
        <ul class="flex flex-col gap-1">
          <li
            v-if="lobby.role === 'host'"
            class="flex items-center gap-2"
          >
            <span class="flex-1">{{ t('you') }}</span>
            <ShadcnBadge variant="secondary">
              {{ t('host') }}
            </ShadcnBadge>
          </li>
          <li
            v-else
            class="flex items-center gap-2"
          >
            <span class="flex-1">{{ t('theHost') }}</span>
            <ShadcnBadge variant="secondary">
              {{ t('host') }}
            </ShadcnBadge>
          </li>

          <template v-if="lobby.role === 'host'">
            <li
              v-for="player in lobby.players"
              :key="player.channelId"
              class="flex items-center gap-2"
            >
              <span class="flex-1 min-w-0 truncate">{{ player.displayName }}</span>
              <span
                v-if="player.state === 'connecting'"
                class="text-sm text-muted-foreground"
              >{{ t('connecting') }}</span>
              <ShadcnBadge :variant="player.verified ? 'default' : 'outline'">
                {{ player.verified ? t('verified') : t('notVerified') }}
              </ShadcnBadge>
              <ShadcnButton
                variant="ghost"
                size="icon"
                :aria-label="t('remove', { name: player.displayName })"
                @click="lobby.removePlayer(player.channelId)"
              >
                <X class="size-4" />
              </ShadcnButton>
            </li>
            <li
              v-if="lobby.players.length === 0"
              class="text-sm text-muted-foreground"
            >
              {{ t('nobodyYet') }}
            </li>
          </template>
          <template v-else>
            <li
              v-for="(player, index) in lobby.guestView?.players ?? []"
              :key="index"
              class="flex items-center gap-2"
            >
              <span class="flex-1 min-w-0 truncate">{{ player.displayName }}</span>
              <ShadcnBadge :variant="player.verified ? 'default' : 'outline'">
                {{ player.verified ? t('verified') : t('notVerified') }}
              </ShadcnBadge>
            </li>
          </template>
        </ul>
      </section>

      <section
        v-if="lobby.role === 'host'"
        class="flex flex-col gap-2"
      >
        <h3 class="font-semibold">
          {{ t('invite') }}
        </h3>
        <p
          v-if="lobby.contactsFailed"
          class="text-sm text-destructive"
        >
          {{ t('contactsFailed') }}
        </p>
        <p
          v-else-if="lobby.contacts.length === 0"
          class="text-sm text-muted-foreground"
        >
          {{ t('noContacts') }}
        </p>
        <ul class="flex flex-col gap-1 max-h-48 overflow-y-auto">
          <li
            v-for="contact in lobby.contacts"
            :key="contact.id"
            class="flex items-center gap-2"
          >
            <span class="flex-1 min-w-0 truncate">{{ contact.displayName }}</span>
            <span
              v-if="statusOf(contact)"
              class="text-sm text-muted-foreground text-right"
            >
              {{ t(`status.${statusOf(contact)!.status}`) }}
              <template v-if="statusOf(contact)!.hint">· {{ t('shareCard') }}</template>
            </span>
            <ShadcnButton
              size="sm"
              variant="secondary"
              :disabled="!canInvite(contact)"
              @click="invite(contact)"
            >
              {{ t('inviteButton') }}
            </ShadcnButton>
          </li>
        </ul>
      </section>

      <p
        v-if="lobby.role === 'guest'"
        class="text-muted-foreground"
      >
        {{ t('waitingForHost') }}
      </p>

      <div class="flex gap-2">
        <ShadcnButton
          variant="ghost"
          @click="lobby.leave()"
        >
          {{ lobby.role === 'host' ? t('closeLobby') : t('leave') }}
        </ShadcnButton>
        <ShadcnButton
          v-if="lobby.role === 'host'"
          class="flex-1"
          :disabled="!lobby.canStart"
          @click="start"
        >
          {{ lobby.starting ? t('starting') : t('start') }}
        </ShadcnButton>
      </div>
    </template>
  </div>
</template>

<i18n lang="yaml">
de:
  title: Mehrspieler
  joining: Beitritt läuft …
  summary: "{game} · {mode} · {map} · Schwierigkeit {skill}"
  coop: Kooperativ
  deathmatch: Deathmatch
  joinCode: Beitrittscode
  copy: Kopieren
  copied: Beitrittscode kopiert.
  copyFailed: Der Code konnte nicht kopiert werden. Markiere ihn und kopiere ihn von Hand.
  players: Mitspieler
  you: Du
  theHost: Gastgeber
  host: Gastgeber
  connecting: Verbindet …
  verified: Kontakt
  notVerified: Nicht verifiziert
  remove: "{name} entfernen"
  nobodyYet: Noch niemand beigetreten.
  invite: Kontakte einladen
  inviteButton: Einladen
  noContacts: Keine Kontakte mit einem Vault gefunden.
  contactsFailed: Die Kontakte konnten nicht gelesen werden. Du kannst trotzdem den Beitrittscode teilen.
  status:
    pending: Wartet auf Antwort
    accepted: Angenommen
    declined: Abgelehnt
    not-installed: DOOM nicht installiert
    unreachable: Nicht erreichbar
    expired: Abgelaufen
    left: Hat verlassen
  shareCard: bitte um eine aktuelle Visitenkarte
  waitingForHost: Warte darauf, dass der Gastgeber das Spiel startet …
  closeLobby: Lobby schließen
  leave: Verlassen
  start: Spiel starten
  starting: Startet …
  openFailed:
    limit: Du hast zu viele offene Spiele.
    failed: Die Lobby konnte nicht geöffnet werden.
  inviteFailed:
    closed: Die Lobby ist nicht mehr offen.
    duplicate: Dieser Kontakt ist schon eingeladen.
    full: Es sind höchstens drei Mitspieler möglich.
    contact_unknown: Dieser Kontakt kann nicht eingeladen werden.
    network_unavailable: Die Einladung konnte nicht gesendet werden.
    limit: Zu viele offene Einladungen.
    failed: Die Einladung konnte nicht gesendet werden.
  startFailed:
    no-guests: Es ist noch niemand beigetreten.
    not-open: Die Lobby ist nicht mehr offen.
    failed: Das Spiel konnte nicht gestartet werden.
en:
  title: Multiplayer
  joining: Joining …
  summary: "{game} · {mode} · {map} · skill {skill}"
  coop: Cooperative
  deathmatch: Deathmatch
  joinCode: Join code
  copy: Copy
  copied: Join code copied.
  copyFailed: The code could not be copied. Select it and copy it by hand.
  players: Players
  you: You
  theHost: Host
  host: Host
  connecting: Connecting …
  verified: Contact
  notVerified: Not verified
  remove: "Remove {name}"
  nobodyYet: Nobody has joined yet.
  invite: Invite contacts
  inviteButton: Invite
  noContacts: No contacts with a vault found.
  contactsFailed: The contacts could not be read. You can still share the join code.
  status:
    pending: Waiting for an answer
    accepted: Accepted
    declined: Declined
    not-installed: DOOM not installed
    unreachable: Not reachable
    expired: Expired
    left: Left
  shareCard: ask them to share a current card
  waitingForHost: Waiting for the host to start the game …
  closeLobby: Close lobby
  leave: Leave
  start: Start game
  starting: Starting …
  openFailed:
    limit: You have too many open games.
    failed: The lobby could not be opened.
  inviteFailed:
    closed: The lobby is no longer open.
    duplicate: This contact is already invited.
    full: A game has at most three other players.
    contact_unknown: This contact cannot be invited.
    network_unavailable: The invitation could not be sent.
    limit: Too many open invitations.
    failed: The invitation could not be sent.
  startFailed:
    no-guests: Nobody has joined yet.
    not-open: The lobby is no longer open.
    failed: The game could not be started.
</i18n>
