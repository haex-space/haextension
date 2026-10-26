import type { GameFamily } from "~/lib/bundledGames";
import type { ContactsSource } from "~/lib/contacts";
import type { GameRef, GameSettings, LobbyPlayer, LobbyVisibility, RejectReason } from "~/lib/lobbyProtocol";
import type { PeerSession } from "~/lib/peers";

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
