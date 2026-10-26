import type { PeerInviteStatus, PeerJoined } from "@haex-space/vault-sdk";
import {
  checkCompatibility,
  cleanName,
  hostArguments,
  MAX_GUESTS,
  PROTOCOL_VERSION,
  type InvitePayload,
  type LobbyMessage,
  type OutgoingMessage,
  type ProtocolMessage,
} from "~/lib/lobbyProtocol";
import type { InvitableContact } from "~/lib/contacts";
import { DEFAULT_NAME, FLUSH_DELAY_MS, type LobbyContext } from "~/lib/lobbyContext";
import type { HostPlayer, HostSettings, InviteFailure, StartFailure } from "~/lib/lobbyTypes";
import { peerReason } from "~/lib/peers";

/** The host side of the lobby: opening, inviting, admitting, removing and starting. */
export function createHost(ctx: LobbyContext) {
  const { deps, peers, api, sleep, role, phase, settings, lobbyId, joinCode, players, invites, starting, startRequest, earlyStatuses, joinedGuests } = ctx;
  const { say, logFailure, send, closeChannel, rejectAndClose, attach, endSession } = ctx;
  const newLobbyId = deps.newLobbyId ?? (() => crypto.randomUUID());

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
    if (announce && guest.state === "playing") say({ kind: "guest-left", name: guest.displayName });
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
    const message = { t: "start", nodes, ...startSettings(current) } as OutgoingMessage;
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
  return { openLobby, invite, onJoined, onInviteStatus, onHello, removeGuest, removePlayer, startGame };
}
