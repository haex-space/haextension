# Contract: peer channels as haex-doom uses them

The host side is specified in the vault host repository, which is the source of truth for the bridge, the wire protocol and the SDK surface:

- `haex-space/haex-vault@8973b7afd02542aa7077d6a43e5d238f5b7cf2e5:specs/057-extension-peer-channels/` — `spec.md`, `contracts/bridge.md`, `contracts/wire-protocol.md`, `contracts/sdk.md`, ADR `docs/adr/0016-non-contact-devices-for-public-lobbies.md`.

The SDK change (`client.peers`) lands in `haex-space/vault-sdk`. This file lists only what haex-doom relies on; where it differs from the host's contract, the host's contract wins.

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
| `sendAsync(channelId, bytes, { reliable })` | DOOM packets unreliable (≤ 1,024 bytes); lobby messages reliable (≤ 64 KiB). |
| `closeAsync(channelId)` | Leaving. |

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

The host answers with its existing numeric codes plus `details.reason`; the SDK maps them. haex-doom shows:

| `reason` | Shown as |
|---|---|
| `lobby_closed` | "This game is no longer open" |
| `not_admitted` | "Only the host's contacts may join" (contacts-only lobby) or "You were removed from this game" |
| `contact_unknown` | "This contact cannot be invited" |
| `too_large`, `limit`, `network_unavailable`, `channel_closed` | Logged; the lobby shows a generic connection error |

`not_admitted` shares code 1002 with a permission denial; haex-doom distinguishes them by `reason`.

## Lifecycle

When the extension's last frame on a device closes, the vault closes all its channels and lobbies and withdraws its open invitations. A netgame therefore ends for a player who closes the extension, which matches FR-032.
