import { computed, ref, shallowRef } from "vue";
import type { PeerChannelOpened, PeerInviteStatus, PeerJoined } from "@haex-space/vault-sdk";
import type { GameFamily } from "~/lib/bundledGames";
import { listInvitableContacts, type ContactsSource, type InvitableContact } from "~/lib/contacts";
import {
  checkCompatibility,
  cleanName,
  decodeMessage,
  encodeMessage,
  guestArguments,
  hostArguments,
  MAX_GUESTS,
  parseInvitePayload,
  PROTOCOL_VERSION,
  type GameRef,
  type GameSettings,
  type InvitePayload,
  type LobbyMessage,
  type LobbyPlayer,
  type LobbyVisibility,
  type ProtocolMessage,
  type RejectReason,
} from "~/lib/lobbyProtocol";
import { peerReason, type PeerSession } from "~/lib/peers";

export interface LocalGame extends GameRef {
  family: GameFamily;
}

/** What the host chose when opening the lobby; fixed while the lobby is open. */
export interface HostSettings extends GameSettings {
  game: LocalGame;
  visibility: LobbyVisibility;
}

export type InviteStatus = "pending" | "accepted" | "declined" | "not-installed" | "unreachable" | "expired" | "left";

export interface Invite {
  inviteId: string;
  contactId: string;
  name: string;
  status: InviteStatus;
  hint?: "share_current_card";
  channelId?: string;
}

/** A guest as the host sees it: `connecting` until its `hello` was accepted. */
export interface HostPlayer {
  channelId: string;
  contactId: string | null;
  displayName: string;
  verified: boolean;
  state: "connecting" | "joined" | "playing";
}

/** The lobby as a guest sees it: from the invitation first, then from the host's `lobby` messages. */
export interface GuestView extends GameSettings {
  game: GameRef;
  players: LobbyPlayer[];
}

export type Notice =
  | { kind: "guest-left"; name: string }
  | { kind: "host-left" }
  | { kind: "connection-lost" }
  | { kind: "rejected"; reason: RejectReason }
  | { kind: "incompatible"; reason: "game-missing" | "version"; game: string }
  | { kind: "invalid-invitation" }
  | { kind: "busy" };

export type JoinFailure = "lobby_closed" | "not_admitted" | "network_unavailable" | "limit" | "busy" | "failed";
export type InviteFailure = "closed" | "duplicate" | "full" | "contact_unknown" | "network_unavailable" | "limit" | "failed";
export type StartFailure = "no-guests" | "not-open" | "failed";

/** What the page needs to start the engine of a netgame. */
export interface StartRequest {
  role: "host" | "guest";
  fingerprint: string;
  args: string[];
}

export interface LobbyDeps {
  peers: PeerSession;
  games: () => readonly LocalGame[];
  /** The version of this extension, which every player must share. */
  version: () => string;
  /** The player's own name, for `hello` when the player did not type one (invitations). */
  displayName: () => string;
  contacts?: ContactsSource;
  /** True while a single-player game runs here: an invitation cannot be taken then. */
  busy?: () => boolean;
  newLobbyId?: () => string;
  /** Waits before a channel is closed after a final message, so the message can be delivered. */
  sleep?: (ms: number) => Promise<void>;
}

const FLUSH_DELAY_MS = 300;
const MAX_BUFFERED_CHANNELS = 8;
const MAX_BUFFERED_MESSAGES = 8;
const DEFAULT_NAME = "Player";

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The host and guest state machines of a multiplayer lobby (data-model.md "Lobby"). It is
 * created once per page by the Pinia store (stores/lobby.ts); tests create two of them over a
 * fake peers API.
 */
export function createLobby(deps: LobbyDeps) {
  const { peers } = deps;
  const api = peers.api;
  const sleep = deps.sleep ?? defaultSleep;
  const newLobbyId = deps.newLobbyId ?? (() => crypto.randomUUID());

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

  let hostChannel: string | null = null;
  let helloSent = false;
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

  async function send(channelId: string, message: Parameters<typeof encodeMessage>[0]): Promise<boolean> {
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
    return channelId === hostChannel || players.value.some((player) => player.channelId === channelId);
  }

  /** A channel this lobby now knows: replays what arrived on it before. */
  function attach(channelId: string) {
    const waiting = buffered.get(channelId);
    buffered.delete(channelId);
    for (const data of waiting ?? []) handleMessage(channelId, data);
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
    hostChannel = null;
    helloSent = false;
    earlyStatuses.clear();
    buffered.clear();
  }

  // ----- host -----

  function lobbyMessage(): LobbyMessage | null {
    const current = settings.value;
    if (!current) return null;
    const { game, mode, monsters, timeLimit, map, skill } = current;
    return {
      t: "lobby",
      v: PROTOCOL_VERSION,
      game: { title: game.title, fingerprint: game.fingerprint },
      ...(mode === "deathmatch" ? { mode, monsters, timeLimit } : { mode }),
      map,
      skill,
      players: joinedGuests.value.map(({ displayName, verified, state }) => ({ displayName, verified, state: state === "playing" ? "playing" : "joined" })),
    } as LobbyMessage;
  }

  async function broadcastLobby(only?: string) {
    const message = lobbyMessage();
    if (!message) return;
    const targets = players.value.filter((player) => only === undefined || player.channelId === only);
    await Promise.all(targets.map((player) => send(player.channelId, message)));
  }

  /** Opens a lobby with these settings; the join code is then in `joinCode`. */
  async function openLobby(chosen: HostSettings): Promise<"ok" | "limit" | "failed"> {
    if (role.value !== "none") return "failed";
    role.value = "host";
    phase.value = "opening";
    const id = newLobbyId();
    try {
      const opened = await api.openLobbyAsync(id, chosen.visibility);
      settings.value = chosen;
      lobbyId.value = id;
      joinCode.value = opened.joinCode;
      phase.value = "lobby";
      return "ok";
    } catch (error) {
      logFailure("Could not open the lobby", error);
      endSession();
      return peerReason(error) === "limit" ? "limit" : "failed";
    }
  }

  function inviteSlotsTaken() {
    return players.value.length + invites.value.filter((invite) => invite.status === "pending").length;
  }

  function invitePayload(current: HostSettings, id: string): InvitePayload {
    const { game, mode, monsters, timeLimit, map, skill, visibility } = current;
    return {
      v: 1,
      lobbyId: id,
      game: { title: game.title, fingerprint: game.fingerprint },
      ...(mode === "deathmatch" ? { mode, monsters, timeLimit } : { mode }),
      map,
      skill,
      visibility,
      extensionVersion: deps.version(),
    } as InvitePayload;
  }

  async function invite(contact: InvitableContact): Promise<"ok" | InviteFailure> {
    const current = settings.value;
    const id = lobbyId.value;
    if (role.value !== "host" || phase.value !== "lobby" || !current || !id) return "closed";
    const open = invites.value.find((entry) => entry.contactId === contact.id && (entry.status === "pending" || entry.status === "accepted"));
    if (open) return "duplicate";
    if (inviteSlotsTaken() >= MAX_GUESTS) return "full";

    try {
      const { inviteId } = await api.inviteAsync(contact.id, invitePayload(current, id));
      invites.value = [...invites.value.filter((entry) => entry.contactId !== contact.id), { inviteId, contactId: contact.id, name: contact.displayName, status: "pending" }];
      const early = earlyStatuses.get(inviteId);
      earlyStatuses.delete(inviteId);
      if (early) onInviteStatus(early);
      return "ok";
    } catch (error) {
      logFailure("Could not invite the contact", error);
      const reason = peerReason(error);
      return reason === "contact_unknown" || reason === "network_unavailable" || reason === "limit" ? reason : "failed";
    }
  }

  async function addGuest(guest: Omit<HostPlayer, "state">) {
    if (players.value.length >= MAX_GUESTS) {
      await rejectAndClose(guest.channelId, "full");
      return;
    }
    peers.register(guest.channelId);
    players.value = [...players.value, { ...guest, state: "connecting" }];
    attach(guest.channelId);
    await broadcastLobby(guest.channelId);
  }

  function onJoined(event: PeerJoined) {
    if (role.value !== "host" || phase.value !== "lobby" || starting.value || event.lobbyId !== lobbyId.value) {
      void closeChannel(event.channelId);
      return;
    }
    void addGuest({
      channelId: event.channelId,
      contactId: event.contactId ?? null,
      displayName: cleanName(event.displayName) || DEFAULT_NAME,
      verified: event.verified,
    });
  }

  function onInviteStatus(event: PeerInviteStatus) {
    const entry = invites.value.find((candidate) => candidate.inviteId === event.inviteId);
    if (!entry) {
      if (role.value === "host") earlyStatuses.set(event.inviteId, event);
      return;
    }
    entry.status = event.status;
    if (event.hint) entry.hint = event.hint;
    invites.value = [...invites.value];
    if (event.status === "accepted" && event.channelId) {
      entry.channelId = event.channelId;
      if (phase.value !== "lobby" || starting.value) {
        void closeChannel(event.channelId);
        return;
      }
      // The vault only delivers invitations to contacts, so an invited guest is verified.
      void addGuest({ channelId: event.channelId, contactId: entry.contactId, displayName: entry.name, verified: true });
    }
  }

  async function onHello(channelId: string, message: Extract<ProtocolMessage, { t: "hello" }>) {
    const current = settings.value;
    const player = players.value.find((candidate) => candidate.channelId === channelId);
    if (!current || !player || player.state !== "connecting") return;
    const verdict = checkCompatibility({ game: { fingerprint: message.fingerprint }, extensionVersion: message.extensionVersion }, [current.game], deps.version());
    if (verdict !== "ok") {
      removeGuest(channelId);
      await rejectAndClose(channelId, verdict);
      return;
    }
    player.state = "joined";
    players.value = [...players.value];
    await broadcastLobby();
  }

  /** Takes a guest out of the roster; says so when the game is already running. */
  function removeGuest(channelId: string, announce = false) {
    const guest = players.value.find((player) => player.channelId === channelId);
    if (!guest) return;
    players.value = players.value.filter((player) => player.channelId !== channelId);
    const entry = invites.value.find((candidate) => candidate.channelId === channelId);
    if (entry) {
      entry.status = "left";
      invites.value = [...invites.value];
    }
    if (announce && guest.state !== "connecting") say({ kind: "guest-left", name: guest.displayName });
    if (phase.value === "lobby") void broadcastLobby();
  }

  /** The host removes a player; the player cannot rejoin this lobby (FR-045). */
  async function removePlayer(channelId: string) {
    if (role.value !== "host" || !players.value.some((player) => player.channelId === channelId)) return;
    removeGuest(channelId);
    await send(channelId, { t: "reject", reason: "removed" });
    await sleep(FLUSH_DELAY_MS);
    await api.removeAsync(channelId).catch((error: unknown) => logFailure("Could not remove the player", error));
  }

  async function startGame(): Promise<"ok" | StartFailure> {
    const current = settings.value;
    const id = lobbyId.value;
    if (role.value !== "host" || phase.value !== "lobby" || !current || !id) return "not-open";
    const guests = joinedGuests.value;
    if (guests.length === 0) return "no-guests";
    starting.value = true;

    // Whoever has not said hello yet is left out; open invitations are withdrawn.
    const late = players.value.filter((player) => player.state === "connecting");
    players.value = guests;
    await Promise.all([
      ...late.map((player) => closeChannel(player.channelId)),
      ...invites.value.filter((entry) => entry.status === "pending").map((entry) => api.cancelInviteAsync(entry.inviteId).catch(() => {})),
    ]);
    await api.closeLobbyAsync(id).catch((error: unknown) => logFailure("Could not close the lobby", error));

    const nodes = guests.length + 1;
    peers.beginNetgame();
    const message = { t: "start", nodes, ...startSettings(current) } as Parameters<typeof encodeMessage>[0];
    await Promise.all(guests.map((guest) => send(guest.channelId, message)));
    players.value = players.value.map((player) => ({ ...player, state: "playing" }));
    phase.value = "running";
    starting.value = false;
    startRequest.value = { role: "host", fingerprint: current.game.fingerprint, args: hostArguments(current, nodes) };
    return "ok";
  }

  function startSettings({ mode, monsters, timeLimit, map, skill }: HostSettings) {
    return mode === "deathmatch" ? { mode, monsters, timeLimit, map, skill } : { mode, map, skill };
  }

  // ----- guest -----

  /** Joins a lobby by its code (FR-044). */
  async function join(code: string, displayName: string): Promise<"ok" | JoinFailure> {
    if (role.value !== "none" || deps.busy?.()) return "busy";
    const name = cleanName(displayName, 64);
    role.value = "guest";
    phase.value = "joining";
    try {
      const joined = await api.joinAsync(code.trim(), name, { v: PROTOCOL_VERSION, extensionVersion: deps.version() });
      if (phase.value !== "joining") {
        // Left or reset while the host was answering.
        await closeChannel(joined.channelId);
        return "failed";
      }
      lobbyId.value = joined.lobbyId;
      enterAsGuest(joined.channelId);
      phase.value = "lobby";
      attach(joined.channelId);
      return "ok";
    } catch (error) {
      logFailure("Could not join the lobby", error);
      endSession();
      const reason = peerReason(error);
      return reason === "lobby_closed" || reason === "not_admitted" || reason === "network_unavailable" || reason === "limit" ? reason : "failed";
    }
  }

  function enterAsGuest(channelId: string) {
    hostChannel = channelId;
    peers.setHost(channelId);
    helloSent = false;
  }

  async function sendHello(name: string) {
    const fingerprint = guestView.value?.game.fingerprint;
    if (!hostChannel || !fingerprint || helloSent) return;
    helloSent = true;
    await send(hostChannel, { t: "hello", fingerprint, extensionVersion: deps.version(), displayName: cleanName(name, 64) || DEFAULT_NAME });
  }

  /** The guest leaves before the game (or the player cancelled a refused join). */
  async function leaveAsGuest(final?: Notice) {
    const channel = hostChannel;
    if (channel) {
      await send(channel, { t: "leave" });
      await sleep(FLUSH_DELAY_MS);
      await closeChannel(channel);
    }
    endSession();
    if (final) say(final);
  }

  function onLobbyMessage(message: LobbyMessage) {
    const previous = guestView.value;
    if (previous && previous.game.fingerprint !== message.game.fingerprint) {
      void leaveAsGuest({ kind: "connection-lost" });
      return;
    }
    guestView.value = { game: message.game, mode: message.mode, monsters: message.monsters, timeLimit: message.timeLimit, map: message.map, skill: message.skill, players: message.players };
    if (!helloSent) {
      // A player who joined by code learns the game only now (FR-030).
      const verdict = checkCompatibility({ game: message.game, extensionVersion: deps.version() }, deps.games(), deps.version());
      if (verdict !== "ok") void leaveAsGuest({ kind: "incompatible", reason: "game-missing", game: message.game.title });
      else void sendHello(deps.displayName());
    }
  }

  function onStartMessage(message: Extract<ProtocolMessage, { t: "start" }>) {
    const view = guestView.value;
    if (role.value !== "guest" || phase.value !== "lobby" || !view) return;
    peers.beginNetgame();
    phase.value = "running";
    startRequest.value = { role: "guest", fingerprint: view.game.fingerprint, args: guestArguments() };
    guestView.value = { ...view, mode: message.mode, monsters: message.monsters, timeLimit: message.timeLimit, map: message.map, skill: message.skill };
  }

  async function onInvitationOpened(event: PeerChannelOpened) {
    if (role.value !== "none" || deps.busy?.()) {
      say({ kind: "busy" });
      await closeChannel(event.channelId);
      return;
    }
    const payload = parseInvitePayload(event.payload);
    if (!payload) {
      say({ kind: "invalid-invitation" });
      await closeChannel(event.channelId);
      return;
    }
    // The vault already asked the user; only the game and the version are checked here (FR-030).
    const verdict = checkCompatibility(payload, deps.games(), deps.version());
    if (verdict !== "ok") {
      say({ kind: "incompatible", reason: verdict, game: payload.game.title });
      await send(event.channelId, { t: "leave" });
      await sleep(FLUSH_DELAY_MS);
      await closeChannel(event.channelId);
      return;
    }
    role.value = "guest";
    phase.value = "lobby";
    lobbyId.value = payload.lobbyId;
    enterAsGuest(event.channelId);
    const { game, mode, monsters, timeLimit, map, skill } = payload;
    guestView.value = { game, mode, monsters, timeLimit, map, skill, players: [] };
    attach(event.channelId);
    await sendHello(deps.displayName());
  }

  // ----- both -----

  function handleMessage(channelId: string, data: Uint8Array) {
    const message = decodeMessage(data);
    if (!message) {
      console.warn("[haex-doom] Ignored a lobby message that is not valid.");
      return;
    }
    if (role.value === "host") {
      if (message.t === "hello") void onHello(channelId, message);
      else if (message.t === "leave") {
        removeGuest(channelId, true);
        void closeChannel(channelId);
      }
      return;
    }
    if (role.value !== "guest" || channelId !== hostChannel) return;
    switch (message.t) {
      case "lobby":
        onLobbyMessage(message);
        break;
      case "start":
        onStartMessage(message);
        break;
      case "reject":
        endSession();
        say({ kind: "rejected", reason: message.reason });
        void closeChannel(channelId);
        break;
      case "leave":
        endSession();
        say({ kind: "host-left" });
        void closeChannel(channelId);
        break;
      default:
        break;
    }
  }

  function onReliable(channelId: string, data: Uint8Array) {
    if (knownChannel(channelId)) handleMessage(channelId, data);
    else buffer(channelId, data);
  }

  function onChannelClosed(channelId: string, reason: string) {
    buffered.delete(channelId);
    if (role.value === "host") {
      removeGuest(channelId, true);
    } else if (role.value === "guest" && channelId === hostChannel) {
      endSession();
      say(reason === "closed" ? { kind: "host-left" } : { kind: "connection-lost" });
    }
  }

  /** Leaves: the host ends the game for everyone (FR-032), a guest leaves it. */
  async function leave() {
    if (role.value === "guest") {
      await leaveAsGuest();
      return;
    }
    if (role.value !== "host") return;
    const id = lobbyId.value;
    const channels = players.value.map((player) => player.channelId);
    const open = invites.value.filter((entry) => entry.status === "pending");
    // Ends the session first, so the closing channels are not reported as guests leaving.
    endSession();
    await Promise.all(channels.map((channelId) => send(channelId, { t: "leave" })));
    await Promise.all([
      ...open.map((entry) => api.cancelInviteAsync(entry.inviteId).catch(() => {})),
      id ? api.closeLobbyAsync(id).catch(() => {}) : Promise.resolve(),
    ]);
    await sleep(FLUSH_DELAY_MS);
    await Promise.all(channels.map(closeChannel));
  }

  /** The engine stopped (quit, error or the end of the game): the session ends with it. */
  async function engineStopped() {
    if (phase.value === "running") await leave();
  }

  async function loadContacts() {
    if (!deps.contacts) return;
    contactsFailed.value = false;
    try {
      contacts.value = await listInvitableContacts(deps.contacts);
    } catch (error) {
      logFailure("Could not list the contacts", error);
      contacts.value = [];
      contactsFailed.value = true;
    }
  }

  const stops = [
    peers.onReliable(onReliable),
    peers.onClosed(onChannelClosed),
    api.on("joined", onJoined),
    api.on("invite-status", onInviteStatus),
    api.on("channel-opened", (event) => {
      if (event.origin === "invitation") void onInvitationOpened(event);
    }),
  ];

  return {
    role,
    phase,
    active,
    settings,
    lobbyId,
    joinCode,
    players,
    invites,
    guestView,
    contacts,
    contactsFailed,
    starting,
    canStart,
    startRequest,
    notice,
    openLobby,
    invite,
    removePlayer,
    startGame,
    join,
    leave,
    engineStopped,
    loadContacts,
    clearStartRequest() {
      startRequest.value = null;
    },
    dispose() {
      for (const stop of stops) if (typeof stop === "function") stop();
    },
  };
}

export type Lobby = ReturnType<typeof createLobby>;
