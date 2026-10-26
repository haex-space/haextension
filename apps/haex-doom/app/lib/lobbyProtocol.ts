/**
 * The lobby protocol between the host's and the guests' haex-doom frames
 * (specs/020-haex-doom/contracts/lobby-protocol.md). Everything that arrives from a peer is
 * untrusted: it is parsed and validated here before anything else looks at it.
 */

export const PROTOCOL_VERSION = 1;

export const MAX_GUESTS = 3;
export const MIN_NODES = 2;
export const MAX_NODES = 4;

export type LobbyMode = "coop" | "deathmatch";
export type LobbyVisibility = "contacts" | "public";
export type TimeLimit = 0 | 10 | 20;
export type RejectReason = "game-missing" | "version" | "full" | "removed";
/** What the host shows for a guest: `joined` waits in the lobby, `playing` is in the running game. */
export type GuestState = "joined" | "playing";
export type Compatibility = "ok" | "game-missing" | "version";

export interface GameRef {
  title: string;
  fingerprint: string;
}

/** The settings of a game; `monsters` and `timeLimit` exist for deathmatch only. */
export interface GameSettings {
  mode: LobbyMode;
  monsters?: boolean;
  timeLimit?: TimeLimit;
  map: string;
  skill: number;
}

export interface InvitePayload extends GameSettings {
  v: 1;
  lobbyId: string;
  game: GameRef;
  visibility: LobbyVisibility;
  extensionVersion: string;
}

export interface JoinPayload {
  v: 1;
  extensionVersion: string;
}

export interface LobbyPlayer {
  displayName: string;
  verified: boolean;
  state: GuestState;
}

export interface HelloMessage {
  t: "hello";
  v: 1;
  fingerprint: string;
  extensionVersion: string;
  displayName: string;
}

export interface LobbyMessage extends GameSettings {
  t: "lobby";
  v: 1;
  game: GameRef;
  players: LobbyPlayer[];
}

export interface RejectMessage {
  t: "reject";
  v: 1;
  reason: RejectReason;
}

export interface StartMessage extends GameSettings {
  t: "start";
  v: 1;
  nodes: number;
}

export interface LeaveMessage {
  t: "leave";
  v: 1;
}

export type ProtocolMessage = HelloMessage | LobbyMessage | RejectMessage | StartMessage | LeaveMessage;

const FINGERPRINT = /^[0-9a-f]{64}$/;
const MAP = /^(?:E[1-4]M[1-9]|MAP(?:0[1-9]|[12][0-9]|3[0-2]))$/;
const LOBBY_ID = /^[A-Za-z0-9._-]{1,64}$/;
const REJECT_REASONS: readonly string[] = ["game-missing", "version", "full", "removed"];
const MAX_TITLE = 128;
const MAX_VERSION = 32;
const MAX_NAME = 64;
/** Far above what four players need; larger input is not ours. */
const MAX_MESSAGE_BYTES = 8 * 1024;

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length >= 1 && value.length <= max ? value : null;
}

function parseGame(value: unknown): GameRef | null {
  if (!isRecord(value)) return null;
  const title = text(value.title, MAX_TITLE);
  const fingerprint = typeof value.fingerprint === "string" && FINGERPRINT.test(value.fingerprint) ? value.fingerprint : null;
  return title && fingerprint ? { title, fingerprint } : null;
}

/**
 * Mode, deathmatch options, map and skill of `value`; null when invalid. The deathmatch options
 * must be present with deathmatch and absent with cooperative play.
 */
function parseSettings(value: Json): GameSettings | null {
  const { mode, monsters, timeLimit, map, skill } = value;
  if (mode !== "coop" && mode !== "deathmatch") return null;
  if (typeof map !== "string" || !MAP.test(map)) return null;
  if (typeof skill !== "number" || !Number.isInteger(skill) || skill < 1 || skill > 5) return null;

  if (mode === "coop") {
    return monsters === undefined && timeLimit === undefined ? { mode, map, skill } : null;
  }
  if (typeof monsters !== "boolean") return null;
  if (timeLimit !== 0 && timeLimit !== 10 && timeLimit !== 20) return null;
  return { mode, monsters, timeLimit, map, skill };
}

/** A name for display: control characters removed, trimmed, shortened. */
export function cleanName(value: string, max = 32): string {
  // eslint-disable-next-line no-control-regex
  return Array.from(value.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim()).slice(0, max).join("");
}

function parseHello(value: Json): HelloMessage | null {
  const extensionVersion = text(value.extensionVersion, MAX_VERSION);
  const displayName = text(value.displayName, MAX_NAME);
  const fingerprint = typeof value.fingerprint === "string" && FINGERPRINT.test(value.fingerprint) ? value.fingerprint : null;
  if (!extensionVersion || !displayName || !fingerprint) return null;
  return { t: "hello", v: 1, fingerprint, extensionVersion, displayName };
}

function parsePlayers(value: unknown): LobbyPlayer[] | null {
  if (!Array.isArray(value) || value.length > MAX_GUESTS) return null;
  const players: LobbyPlayer[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const displayName = text(entry.displayName, MAX_NAME);
    if (!displayName || typeof entry.verified !== "boolean") return null;
    if (entry.state !== "joined" && entry.state !== "playing") return null;
    players.push({ displayName, verified: entry.verified, state: entry.state });
  }
  return players;
}

function parseLobby(value: Json): LobbyMessage | null {
  const game = parseGame(value.game);
  const settings = parseSettings(value);
  const players = parsePlayers(value.players);
  return game && settings && players ? { t: "lobby", v: 1, game, players, ...settings } : null;
}

function parseStart(value: Json): StartMessage | null {
  const settings = parseSettings(value);
  const nodes = value.nodes;
  if (!settings || typeof nodes !== "number" || !Number.isInteger(nodes) || nodes < MIN_NODES || nodes > MAX_NODES) return null;
  return { t: "start", v: 1, nodes, ...settings };
}

type WithoutVersion<T> = T extends unknown ? Omit<T, "v"> : never;

/** Serialises a message to the bytes `peers.sendAsync` takes; the version is added here. */
export function encodeMessage(message: WithoutVersion<ProtocolMessage>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ ...message, v: PROTOCOL_VERSION }));
}

/** Parses and validates received bytes; null for anything that is not a well-formed message of version 1. */
export function decodeMessage(data: Uint8Array): ProtocolMessage | null {
  if (data.length === 0 || data.length > MAX_MESSAGE_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data));
  } catch {
    return null;
  }
  if (!isRecord(value) || value.v !== PROTOCOL_VERSION) return null;

  switch (value.t) {
    case "hello":
      return parseHello(value);
    case "lobby":
      return parseLobby(value);
    case "reject":
      return typeof value.reason === "string" && REJECT_REASONS.includes(value.reason)
        ? { t: "reject", v: 1, reason: value.reason as RejectReason }
        : null;
    case "start":
      return parseStart(value);
    case "leave":
      return { t: "leave", v: 1 };
    default:
      return null;
  }
}

/** The invitation as the vault hands it to the invited frame; null when it is not one of ours. */
export function parseInvitePayload(value: unknown): InvitePayload | null {
  if (!isRecord(value) || value.v !== PROTOCOL_VERSION) return null;
  const game = parseGame(value.game);
  const settings = parseSettings(value);
  const extensionVersion = text(value.extensionVersion, MAX_VERSION);
  const lobbyId = typeof value.lobbyId === "string" && LOBBY_ID.test(value.lobbyId) ? value.lobbyId : null;
  if (value.visibility !== "contacts" && value.visibility !== "public") return null;
  if (!game || !settings || !extensionVersion || !lobbyId) return null;
  return { v: 1, lobbyId, game, visibility: value.visibility, extensionVersion, ...settings };
}

/** What a player joining by code sends along; null when it is not one of ours. */
export function parseJoinPayload(value: unknown): JoinPayload | null {
  if (!isRecord(value) || value.v !== PROTOCOL_VERSION) return null;
  const extensionVersion = text(value.extensionVersion, MAX_VERSION);
  return extensionVersion ? { v: 1, extensionVersion } : null;
}

/**
 * Whether this device can play the game of an invitation (FR-030): it needs the game file with
 * the same fingerprint and the same extension version, because lockstep play needs identical
 * engines.
 * ponytail: exact version equality; relax to "same engine build" once releases record it.
 */
export function checkCompatibility(
  payload: { game: { fingerprint: string }; extensionVersion: string },
  localGames: readonly { fingerprint: string }[],
  version: string,
): Compatibility {
  if (!localGames.some((game) => game.fingerprint === payload.game.fingerprint)) return "game-missing";
  return payload.extensionVersion === version ? "ok" : "version";
}

/**
 * The engine's `-warp` arguments: DOOM 1 takes episode and map as two digits, DOOM II one map
 * number (Crispy's `D_DoomMain`).
 */
export function warpArguments(map: string): string[] {
  const episodic = /^E(\d)M(\d)$/.exec(map);
  if (episodic) return ["-warp", episodic[1]!, episodic[2]!];
  return ["-warp", String(Number(map.slice(3)))];
}

/** The engine's arguments for the host of a netgame (contracts/engine-bridge.md). */
export function hostArguments(settings: GameSettings, nodes: number): string[] {
  const args = ["-privateserver", "-nodes", String(nodes), "-skill", String(settings.skill), ...warpArguments(settings.map)];
  if (settings.mode === "deathmatch") {
    args.push("-altdeath");
    if (settings.monsters === false) args.push("-nomonsters");
    if (settings.timeLimit) args.push("-timer", String(settings.timeLimit));
  }
  return args;
}

/** The engine's arguments for a guest: the host's address name resolves to the host's channel. */
export function guestArguments(): string[] {
  return ["-connect", "host"];
}
