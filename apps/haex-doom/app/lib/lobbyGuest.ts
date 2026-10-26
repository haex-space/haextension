import type { PeerChannelOpened } from "@haex-space/vault-sdk";
import { DEFAULT_NAME, FLUSH_DELAY_MS, type LobbyContext } from "~/lib/lobbyContext";
import {
  checkCompatibility,
  cleanName,
  guestArguments,
  parseInvitePayload,
  PROTOCOL_VERSION,
  type LobbyMessage,
  type ProtocolMessage,
} from "~/lib/lobbyProtocol";
import type { JoinFailure, Notice } from "~/lib/lobbyTypes";
import { peerReason } from "~/lib/peers";

/** The guest side of the lobby: joining by code, answering an invitation, following the host. */
export function createGuest(ctx: LobbyContext) {
  const { link } = ctx;
  const { deps, peers, api, sleep, role, phase, lobbyId, guestView, startRequest } = ctx;
  const { say, logFailure, send, closeChannel, attach, endSession } = ctx;

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
    link.hostChannel = channelId;
    peers.setHost(channelId);
    link.helloSent = false;
  }

  async function sendHello(name: string) {
    const fingerprint = guestView.value?.game.fingerprint;
    if (!link.hostChannel || !fingerprint || link.helloSent) return;
    link.helloSent = true;
    await send(link.hostChannel, { t: "hello", fingerprint, extensionVersion: deps.version(), displayName: cleanName(name, 64) || DEFAULT_NAME });
  }

  /** The guest leaves before the game (or the player cancelled a refused join). */
  async function leaveAsGuest(final?: Notice) {
    const channel = link.hostChannel;
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
    if (!link.helloSent) {
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
  return { join, leaveAsGuest, onLobbyMessage, onStartMessage, onInvitationOpened };
}
