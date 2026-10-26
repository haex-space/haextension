import { listInvitableContacts } from "~/lib/contacts";
import { createLobbyContext, FLUSH_DELAY_MS } from "~/lib/lobbyContext";
import { createGuest } from "~/lib/lobbyGuest";
import { createHost } from "~/lib/lobbyHost";
import { decodeMessage } from "~/lib/lobbyProtocol";
import type { LobbyDeps } from "~/lib/lobbyTypes";

export type * from "~/lib/lobbyTypes";

/**
 * The host and guest state machines of a multiplayer lobby (data-model.md "Lobby"). It is
 * created once per page by the Pinia store (stores/lobby.ts); tests create two of them over a
 * fake peers API. The sides live in lobbyHost.ts and lobbyGuest.ts; this routes the messages
 * and events to the side the player is on.
 */
export function createLobby(deps: LobbyDeps) {
  const ctx = createLobbyContext(deps);
  const { peers, api, role, phase, players, invites, lobbyId, contacts, contactsFailed, link } = ctx;
  const host = createHost(ctx);
  const guest = createGuest(ctx);

  function handleMessage(channelId: string, data: Uint8Array) {
    const message = decodeMessage(data);
    if (!message) {
      console.warn("[haex-doom] Ignored a lobby message that is not valid.");
      return;
    }
    if (role.value === "host") {
      if (message.t === "hello") void host.onHello(channelId, message);
      else if (message.t === "leave") {
        host.removeGuest(channelId, true);
        void ctx.closeChannel(channelId);
      }
      return;
    }
    if (role.value !== "guest" || channelId !== link.hostChannel) return;
    switch (message.t) {
      case "lobby":
        guest.onLobbyMessage(message);
        break;
      case "start":
        guest.onStartMessage(message);
        break;
      case "reject":
        ctx.endSession();
        ctx.say({ kind: "rejected", reason: message.reason });
        void ctx.closeChannel(channelId);
        break;
      case "leave":
        ctx.endSession();
        ctx.say({ kind: "host-left" });
        void ctx.closeChannel(channelId);
        break;
      default:
        break;
    }
  }
  ctx.hooks.handleMessage = handleMessage;

  function onReliable(channelId: string, data: Uint8Array) {
    if (ctx.knownChannel(channelId)) handleMessage(channelId, data);
    else ctx.buffer(channelId, data);
  }

  function onChannelClosed(channelId: string, reason: string) {
    if (role.value === "host") {
      host.removeGuest(channelId, true);
    } else if (role.value === "guest" && channelId === link.hostChannel) {
      ctx.endSession();
      ctx.say(reason === "closed" ? { kind: "host-left" } : { kind: "connection-lost" });
    }
  }

  /** Leaves: the host ends the game for everyone (FR-032), a guest leaves it. */
  async function leave() {
    if (role.value === "guest") {
      await guest.leaveAsGuest();
      return;
    }
    if (role.value !== "host") return;
    const id = lobbyId.value;
    const channels = players.value.map((player) => player.channelId);
    const open = invites.value.filter((entry) => entry.status === "pending");
    // Ends the session first, so the closing channels are not reported as guests leaving.
    ctx.endSession();
    await Promise.all(channels.map((channelId) => ctx.send(channelId, { t: "leave" })));
    await Promise.all([
      ...open.map((entry) => api.cancelInviteAsync(entry.inviteId).catch(() => {})),
      id ? api.closeLobbyAsync(id).catch(() => {}) : Promise.resolve(),
    ]);
    await ctx.sleep(FLUSH_DELAY_MS);
    await Promise.all(channels.map(ctx.closeChannel));
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
      ctx.logFailure("Could not list the contacts", error);
      contacts.value = [];
      contactsFailed.value = true;
    }
  }

  const stops = [
    peers.onReliable(onReliable),
    peers.onClosed((channelId, reason) => {
      ctx.buffered.delete(channelId);
      onChannelClosed(channelId, reason);
    }),
    api.on("joined", host.onJoined),
    api.on("invite-status", host.onInviteStatus),
    api.on("channel-opened", (event) => {
      if (event.origin === "invitation") void guest.onInvitationOpened(event);
    }),
  ];

  return {
    role,
    phase,
    active: ctx.active,
    settings: ctx.settings,
    lobbyId,
    joinCode: ctx.joinCode,
    players,
    invites,
    guestView: ctx.guestView,
    contacts,
    contactsFailed,
    starting: ctx.starting,
    canStart: ctx.canStart,
    startRequest: ctx.startRequest,
    notice: ctx.notice,
    openLobby: host.openLobby,
    invite: host.invite,
    removePlayer: host.removePlayer,
    startGame: host.startGame,
    join: guest.join,
    leave,
    engineStopped,
    loadContacts,
    clearStartRequest() {
      ctx.startRequest.value = null;
    },
    dispose() {
      for (const stop of stops) if (typeof stop === "function") stop();
    },
  };
}

export type Lobby = ReturnType<typeof createLobby>;
