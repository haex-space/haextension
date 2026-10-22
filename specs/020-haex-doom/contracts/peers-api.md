# Contract: peer channels (vault SDK `client.peers`, host bridge, wire protocol)

Delivered by two pull requests outside this repository: the host (`haex-space/haex-vault`, change H3) and the SDK (`haex-space/vault-sdk`, change S1). This document is the shape all three sides agree on; the host's own contract file (`specs/017-extension-host/contracts/bridge.md` in that repository) gets the bridge part in the same pull request.

## Manifest permission

```json
"permissions": {
  "peers":    [{ "target": "*", "action": "connect" }],
  "contacts": [{ "target": "*", "action": "read" }]
}
```

New permission kind `peers`, action `connect`, target `*`. Granted at install or on first use through the host's runtime prompt (error 1004).

## SDK API (`client.peers`)

| Method | Bridge method | Result |
|---|---|---|
| `openLobbyAsync(lobbyId: string, visibility: "contacts" \| "public")` | `extension_peers_lobby_open` | `{ joinCode: string }`. Registers the lobby with the host's vault; the code works until `closeLobbyAsync`. |
| `closeLobbyAsync(lobbyId: string)` | `extension_peers_lobby_close` | `void`. The join code stops working; open channels stay. Called when the game starts or the lobby is cancelled. |
| `joinAsync(joinCode: string, displayName: string, payload: unknown)` | `extension_peers_join` | `{ channelId: string, lobbyId: string }`, or error `PEER_LOBBY_CLOSED` / `PEER_NOT_ALLOWED`. |
| `removeAsync(channelId: string)` | `extension_peers_remove` | `void`. Closes the channel and bans the remote device from that lobby (FR-045). |
| `inviteAsync(contactId: string, payload: unknown)` | `extension_peers_invite` | `{ inviteId: string }`. Payload is JSON, ≤ 4 KiB. Sent to all of the contact's reachable devices at once. |
| `acceptAsync(inviteId: string)` | `extension_peers_accept` | `{ channelId: string }` |
| `declineAsync(inviteId: string)` | `extension_peers_decline` | `void` |
| `sendAsync(channelId: string, data: Uint8Array, options?: { reliable?: boolean })` | `extension_peers_send` | `void`. Unreliable (QUIC datagram, ≤ 1,100 bytes) by default; `reliable: true` uses the channel's stream (≤ 64 KiB). |
| `closeAsync(channelId: string)` | `extension_peers_close` | `void` |

Binary data travels as base64 on the bridge, like other SDK binary parameters.

## Events (host → extension frames of the same extension)

| Event | Data |
|---|---|
| `peers:invitation` | `{ inviteId, from: { contactId, displayName }, payload }` — on the invitee's side. |
| `peers:invite-status` | `{ inviteId, status: "accepted" \| "declined" \| "not-installed" \| "unreachable" \| "expired", channelId? }` — on the inviter's side, once per invitation (not per device); `channelId` when accepted. `declined`/`not-installed` only when every reached device answered so. |
| `peers:invite-withdrawn` | `{ inviteId }` — on the invitee's other devices after one device accepted, or when the inviter cancelled. |
| `peers:joined` | `{ lobbyId, channelId, displayName, contactId \| null, verified: boolean, payload }` — on the host's side when someone joined by code. |
| `peers:message` | `{ channelId, data: base64, reliable: boolean }` |
| `peers:channel-closed` | `{ channelId, reason: "closed" \| "lost" \| "timeout" }` |

When an invitation arrives and no frame of the extension is open, the host shows a vault notification; its action opens the extension with the query `invite=<inviteId>`, and the host emits `peers:invitation` once the frame's port is ready.

## Error codes

Existing SDK codes: 1002 permission denied, 1004 prompt required. New, in the host's error range for extensions:

| Code | Meaning |
|---|---|
| `PEER_CONTACT_UNKNOWN` | `contactId` does not exist or has no vault devices in its card. |
| `PEER_INVITE_UNKNOWN` | Invitation expired or not for this extension. |
| `PEER_CHANNEL_CLOSED` | Send or close on a closed channel. |
| `PEER_PAYLOAD_TOO_LARGE` | Payload or message over its limit. |
| `PEER_LOBBY_CLOSED` | Join code malformed, unknown, wrong secret, or lobby no longer open. Deliberately one code for all cases. |
| `PEER_NOT_ALLOWED` | Contacts-only lobby and the joiner is not the host's contact, or the joiner was removed from this lobby. |

## Wire protocol (host ↔ host)

- ALPN `holzi-ext-peer/1` on the vault's iroh endpoint; one QUIC connection per channel.
- **Handshake** (first bidirectional stream), like `src-tauri/src/sync/handshake.rs`: both sides send a nonce, then sign `(alpn, nonce_a, nonce_b, endpoint_a, endpoint_b, vault_pubkey)` with their device key and send the signature plus their vault public key. Each side then knows whether the remote device's endpoint and key appear in a stored, signature-valid contact card (`haex_contacts_cards`) of one of its contacts ("verified").
- **Admission** (first control frame after the handshake, within 5 s, else the connection is closed):
  - `Invite` is accepted only from a verified contact (FR-028).
  - `Join` is accepted only for an open lobby with a matching secret (constant-time comparison), from a verified contact if the lobby is contacts-only, and from a device not banned from that lobby (FR-041, FR-044, FR-045).
  - Connections from non-contacts are accepted at all only while at least one public lobby is open; otherwise they are closed right after the handshake.
  - Rate limit per remote endpoint, as the existing accept loop does.
- **Control frames** on the same stream, length-prefixed (u32 LE) CBOR:
  - `Invite { invite_id, extension: { public_key, name }, payload }`
  - `Join { lobby_id, secret, extension: { public_key, name }, display_name, payload }` → `JoinReply { status: accepted | closed | not-allowed }`
  - `Withdraw { invite_id }` — sent to the invitee's other devices after one accepted
  - `InviteReply { invite_id, status: accepted | declined | not-installed }`
  - `Reliable { data }` — application data with `reliable: true`.
  - `Close { reason }`
- **Datagrams**: application data with `reliable: false`, unframed.
- The receiving host delivers only to frames of the extension named in `Invite`/`Join` (same public key and name); an invitation only after the user accepted it.
- Invitations to a contact with several devices: the inviting host dials all devices from the card in parallel; the first `InviteReply { accepted }` wins and the others receive `Withdraw`.
- Idle timeout 30 s with keep-alive every 5 s; an `expired` invitation closes the connection.
