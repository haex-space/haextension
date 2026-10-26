import { computed, ref, shallowRef } from "vue";
import type { PeerInviteStatus } from "@haex-space/vault-sdk";
import type { InvitableContact } from "~/lib/contacts";
import { encodeMessage, type OutgoingMessage, type RejectReason } from "~/lib/lobbyProtocol";
import type { GuestView, HostPlayer, HostSettings, Invite, LobbyDeps, Notice, StartRequest } from "~/lib/lobbyTypes";
import { peerReason } from "~/lib/peers";

/** Time for a final message to arrive before its channel is closed. */
export const FLUSH_DELAY_MS = 300;
export const DEFAULT_NAME = "Player";
const MAX_BUFFERED_CHANNELS = 8;
const MAX_BUFFERED_MESSAGES = 8;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The state shared by the host and the guest side of a lobby, and what both need to talk to the
 * vault: sending, closing, buffering messages of channels not yet known, and ending the session.
 */
export function createLobbyContext(deps: LobbyDeps) {
  const { peers } = deps;
  const api = peers.api;
  const sleep = deps.sleep ?? defaultSleep;

  const role = ref<"none" | "host" | "guest">("none");
  /** opening/joining: a call to the vault is pending; lobby: players gather; running: the netgame runs. */
  const phase = ref<"idle" | "opening" | "joining" | "lobby" | "running">("idle");
  const settings = shallowRef<HostSettings | null>(null);
  const lobbyId = ref<string | null>(null);
  const joinCode = ref<string | null>(null);
  const players = ref<HostPlayer[]>([]);
  const invites = ref<Invite[]>([]);
  const guestView = shallowRef<GuestView | null>(null);
  const contacts = ref<InvitableContact[]>([]);
  const contactsFailed = ref(false);
  const starting = ref(false);
  const startRequest = shallowRef<StartRequest | null>(null);
  const notice = shallowRef<(Notice & { seq: number }) | null>(null);

  /** The guest's link to the host: its channel, and whether the `hello` was sent. */
  const link: { hostChannel: string | null; helloSent: boolean } = { hostChannel: null, helloSent: false };
  /** Replaced by the lobby, which routes messages by role; `attach` replays buffered ones through it. */
  const hooks = { handleMessage: (_channelId: string, _data: Uint8Array): void => {} };
  let noticeSeq = 0;
  /** Statuses that arrived before `inviteAsync` resolved, by invite id. */
  const earlyStatuses = new Map<string, PeerInviteStatus>();
  /** Reliable messages from channels this lobby does not know yet, replayed when they are attached. */
  const buffered = new Map<string, Uint8Array[]>();

  const active = computed(() => phase.value !== "idle");
  const joinedGuests = computed(() => players.value.filter((player) => player.state !== "connecting"));
  const canStart = computed(() => role.value === "host" && phase.value === "lobby" && !starting.value && joinedGuests.value.length >= 1);

  function say(next: Notice) {
    notice.value = { ...next, seq: ++noticeSeq };
  }

  function logFailure(what: string, error: unknown) {
    console.error(`[haex-doom] ${what}:`, error);
  }

  async function send(channelId: string, message: OutgoingMessage): Promise<boolean> {
    try {
      await api.sendAsync(channelId, encodeMessage(message), { reliable: true });
      return true;
    } catch (error) {
      // A channel that closed meanwhile is reported by its own event.
      if (peerReason(error) !== "channel_closed" && peerReason(error) !== "channel_unknown") logFailure("Could not send a lobby message", error);
      return false;
    }
  }

  async function closeChannel(channelId: string) {
    await api.closeAsync(channelId).catch(() => {});
  }

  /** Tells a peer why it is not admitted, gives the message time to arrive, then closes the channel. */
  async function rejectAndClose(channelId: string, reason: RejectReason) {
    await send(channelId, { t: "reject", reason });
    await sleep(FLUSH_DELAY_MS);
    await closeChannel(channelId);
  }

  function knownChannel(channelId: string): boolean {
    return channelId === link.hostChannel || players.value.some((player) => player.channelId === channelId);
  }

  /** A channel this lobby now knows: replays what arrived on it before. */
  function attach(channelId: string) {
    const waiting = buffered.get(channelId);
    buffered.delete(channelId);
    for (const data of waiting ?? []) hooks.handleMessage(channelId, data);
  }

  function buffer(channelId: string, data: Uint8Array) {
    const queue = buffered.get(channelId);
    if (queue) {
      if (queue.length < MAX_BUFFERED_MESSAGES) queue.push(data);
    } else if (buffered.size < MAX_BUFFERED_CHANNELS) {
      buffered.set(channelId, [data]);
    }
  }

  function endSession() {
    peers.reset();
    role.value = "none";
    phase.value = "idle";
    settings.value = null;
    lobbyId.value = null;
    joinCode.value = null;
    players.value = [];
    invites.value = [];
    guestView.value = null;
    starting.value = false;
    startRequest.value = null;
    link.hostChannel = null;
    link.helloSent = false;
    earlyStatuses.clear();
    buffered.clear();
  }

  return {
    deps,
    peers,
    api,
    sleep,
    role,
    phase,
    settings,
    lobbyId,
    joinCode,
    players,
    invites,
    guestView,
    contacts,
    contactsFailed,
    starting,
    startRequest,
    notice,
    link,
    hooks,
    earlyStatuses,
    buffered,
    active,
    joinedGuests,
    canStart,
    say,
    logFailure,
    send,
    closeChannel,
    rejectAndClose,
    knownChannel,
    attach,
    buffer,
    endSession,
  };
}

export type LobbyContext = ReturnType<typeof createLobbyContext>;
