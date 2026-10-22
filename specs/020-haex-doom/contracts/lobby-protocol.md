# Contract: lobby protocol (extension ↔ extension)

Messages between the host player's and the guests' haex-doom frames, sent with `peers.sendAsync(channelId, bytes, { reliable: true })` as UTF-8 JSON. DOOM's own packets use the unreliable path and never carry a JSON header. Encoding and decoding live in one pure module (`app/lib/lobbyProtocol.ts`) with unit tests; every received message is parsed and validated there before use.

## Invitation payload (`peers.inviteAsync` payload)

```json
{ "v": 1, "lobbyId": "…", "game": { "title": "Freedoom: Phase 1", "fingerprint": "…" },
  "mode": "coop", "map": "E1M1", "skill": 3, "extensionVersion": "1.0.0" }
```

The invitee checks the fingerprint and version before accepting; a mismatch is shown with its reason (FR-030), and the invitation is declined.

## Messages

| Direction | Message | Meaning |
|---|---|---|
| guest → host | `{ "t": "hello", "v": 1, "fingerprint", "extensionVersion", "displayName" }` | First message after the channel opens. The host re-checks fingerprint and version and answers `reject` on mismatch. |
| host → guest | `{ "t": "lobby", "players": [{ "displayName", "state" }] }` | Current lobby, sent on every change. |
| host → guest | `{ "t": "reject", "reason": "game-missing" \| "version" \| "full" }` | The guest is not admitted; the host closes the channel. |
| host → guest | `{ "t": "start", "nodes": 2-4, "mode", "map", "skill" }` | Everyone starts the engine; guests with `-connect host`, the host with `-privateserver -nodes N`. |
| any → any | `{ "t": "leave" }` | The sender leaves; the host leaving ends the game (FR-032). |

Unknown `t` values and versions other than `v: 1` are ignored and logged, so a newer peer does not crash an older one.
