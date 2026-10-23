# Contract: peer channels as haex-doom uses them

The host side is specified in the vault host repository, which is the source of truth for the bridge, the wire protocol and the SDK surface:

- `haex-space/haex-vault@520a5e20b335b075e954b646f7861f2e89de73fe:specs/057-extension-peer-channels/` — `spec.md`, `contracts/bridge.md`, `contracts/wire-protocol.md`, `contracts/sdk.md`, ADR `docs/adr/0016-non-contact-devices-for-public-lobbies.md`.

The SDK surface `client.peers` is released in `@haex-space/vault-sdk` 4.9.0 (`haex-space/vault-sdk`, `src/api/peers.ts`, `src/types/peers.ts`). This file lists only what haex-doom relies on; where it differs from the host's contract, the host's contract wins.

At that commit the host's PR 1–3 (transport, lobbies and join codes, invitations and the vault's prompt) are on `main`; the bridge methods, the `peers:*` events and the frame queue (PR 4) are not. haex-doom checks for them at run time (feature detection, see below) until a vault release contains PR 4.

## Manifest permissions

```json
"permissions": {
  "peers":    [{ "target": "*", "action": "connect" }],
  "contacts": [{ "target": "*", "action": "read" }]
}
```

## Calls haex-doom makes

| Call | Used for |
|---|---|
| `openLobbyAsync(lobbyId, "contacts" \| "public")` → `{ joinCode }` | Host opens a lobby (FR-042, FR-043). The code is opaque to the extension. |
| `closeLobbyAsync(lobbyId)` | On start or cancel; the code stops working, open channels stay. |
| `joinAsync(joinCode, displayName, payload)` → `{ channelId, lobbyId }` | A player joins by code (FR-044). |
| `removeAsync(channelId)` | Host removes a player; the player cannot rejoin that lobby (FR-045). |
| `inviteAsync(contactId, payload)` → `{ inviteId }` | Host invites a contact (FR-028); the vault delivers to all of the contact's reachable devices. |
| `cancelInviteAsync(inviteId)` | Host withdraws an invitation, e.g. when the lobby closes. |
| `sendAsync(channelId, bytes, { reliable })` | DOOM packets unreliable (≤ 1,024 bytes); lobby messages reliable (≤ 64 KiB). At most 16 reliable messages wait per channel; one more is refused with `limit` (`details.limit: 16`), so the lobby protocol sends few and small reliable messages. |
| `closeAsync(channelId)` | Leaving. |

Further facts of the released SDK that haex-doom relies on:

- Events are subscribed with `client.peers.on(type, handler)` using the short names `invite-status`, `channel-opened`, `joined`, `message`, `channel-closed`; the call returns a function that unsubscribes. `message.data` arrives as a `Uint8Array`.
- `lobbyId` is chosen by the extension: 1–64 characters of `[A-Za-z0-9._-]`; a second open lobby with the same id fails with `invalid_input`. `joinAsync` waits up to 15 s for the host, so haex-doom must not set a client `timeout` below that. `displayName` is 1–64 characters and unchecked on the host.
- Closing a lobby makes the code useless at once; players already joined stay connected. At most 4 lobbies, 16 channels and a bounded number of invitations are open per extension (`limit`).
- `payload` is JSON of at most 4 KiB; the SDK does not check sizes, the vault answers `too_large`.
- Statuses are not ordered with the call results: `peers:invite-status` can arrive before `inviteAsync` resolves, so the lobby store matches on `inviteId`.

There is no accept or decline call: the invited player accepts in the vault's own prompt, and the extension learns about the invitation only after acceptance.

## Events haex-doom handles

| Event | Effect in haex-doom |
|---|---|
| `peers:channel-opened` `{ channelId, origin: "invitation", inviteId, from: { contactId?, name }, payload }` | On the invited side, after the user accepted in the vault's prompt (the vault opens the extension first if needed). haex-doom checks the payload (game, version — FR-030) and sends `hello` or `leave`. |
| `peers:invite-status` `{ inviteId, status, channelId?, hint? }` | On the host: `accepted` (with `channelId`), `declined`, `not-installed`, `unreachable` (with `hint: "share_current_card"` → "ask the contact to share a current card"), `expired`. |
| `peers:joined` `{ lobbyId, channelId, displayName, contactId?, verified, payload }` | On the host, when someone joined by code; `verified` marks a contact. |
| `peers:message` `{ channelId, data, reliable }` | DOOM packets to the engine (`haex_net_recv`), reliable ones to the lobby store. |
| `peers:channel-closed` `{ channelId, reason }` | Engine treats the peer as gone (`haex_net_peer_closed`); lobby updates. |

`contactId` appears only if the extension's `contacts` permission covers that contact; `from.name` is the name from the other vault's card.

## Errors

The host answers with its existing numeric codes plus `details.reason`; the SDK rethrows them as `PeerError` with `code`, `reason`, a `kind` (`PEER_LOBBY_CLOSED`, `PEER_NOT_ALLOWED`, `PEER_LIMIT`, …) and `limit`. haex-doom branches on `reason`. It shows:

| `reason` | Shown as |
|---|---|
| `lobby_closed` | "This game is no longer open" |
| `not_admitted` | "Only the host's contacts may join" (contacts-only lobby) or "You were removed from this game" |
| `contact_unknown` | "This contact cannot be invited" |
| `network_unavailable` | "The host cannot be reached" (also: no vault session) |
| `limit` | "Too many open games or players" (lobbies, channels, invitations) |
| `too_large`, `channel_closed`, `channel_unknown`, `invite_not_open`, `invalid_input` | Logged; the lobby shows a generic connection error |

`lobby_closed` is one answer for an unreadable code, an unknown or closed lobby, a wrong secret, another extension, a blocked or throttled device; the extension cannot and need not tell them apart.

`not_admitted` shares code 1002 with a permission denial; haex-doom distinguishes them by `reason`.

## Feature detection

A vault older than the host's PR 4 has no `extension_peers_*` methods. `usePeers` probes once (for example `closeLobbyAsync` of an unused id, which is idempotent) and treats an "unknown method" answer as "multiplayer unavailable": the multiplayer entry points are hidden and single-player is unaffected. A `1004` (permission prompt) on the probe is not "unavailable"; the probe is retried after `extension:permission-resolved`.

## Lifecycle

When the extension's last frame on a device closes, the vault closes all its channels and lobbies and withdraws its open invitations. A netgame therefore ends for a player who closes the extension, which matches FR-032.
