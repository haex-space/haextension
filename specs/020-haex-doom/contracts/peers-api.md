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
| `inviteAsync(contactId: string, payload: unknown)` | `extension_peers_invite` | `{ inviteId: string }`. Payload is JSON, ≤ 4 KiB. |
| `acceptAsync(inviteId: string)` | `extension_peers_accept` | `{ channelId: string }` |
| `declineAsync(inviteId: string)` | `extension_peers_decline` | `void` |
| `sendAsync(channelId: string, data: Uint8Array, options?: { reliable?: boolean })` | `extension_peers_send` | `void`. Unreliable (QUIC datagram, ≤ 1,100 bytes) by default; `reliable: true` uses the channel's stream (≤ 64 KiB). |
| `closeAsync(channelId: string)` | `extension_peers_close` | `void` |

Binary data travels as base64 on the bridge, like other SDK binary parameters.

## Events (host → extension frames of the same extension)

| Event | Data |
|---|---|
| `peers:invitation` | `{ inviteId, from: { contactId, displayName }, payload }` — on the invitee's side. |
| `peers:invite-status` | `{ inviteId, status: "accepted" \| "declined" \| "not-installed" \| "unreachable" \| "expired", channelId? }` — on the inviter's side; `channelId` when accepted. |
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

## Wire protocol (host ↔ host)

- ALPN `holzi-ext-peer/1` on the vault's iroh endpoint; one QUIC connection per channel.
- **Handshake** (first bidirectional stream), like `src-tauri/src/sync/handshake.rs`: both sides send a nonce, then sign `(alpn, nonce_a, nonce_b, endpoint_a, endpoint_b, vault_pubkey)` with their device key and send the signature plus their vault public key. Each side accepts only if the remote device's endpoint and key appear in a stored, signature-valid contact card (`haex_contacts_cards`) of one of its contacts.
- **Control frames** on the same stream, length-prefixed (u32 LE) CBOR:
  - `Invite { invite_id, extension: { public_key, name }, payload }`
  - `InviteReply { invite_id, status: accepted | declined | not-installed }`
  - `Reliable { data }` — application data with `reliable: true`.
  - `Close { reason }`
- **Datagrams**: application data with `reliable: false`, unframed.
- The receiving host delivers only to frames of the extension named in `Invite` (same public key and name) and only after the user accepted.
- Idle timeout 30 s with keep-alive every 5 s; an `expired` invitation closes the connection.
