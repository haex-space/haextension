# Contract: lobby protocol (extension ↔ extension)

Messages between the host player's and the guests' haex-doom frames, sent with `peers.sendAsync(channelId, bytes, { reliable: true })` as UTF-8 JSON. DOOM's own packets use the unreliable path and never carry a JSON header. Encoding and decoding live in one pure module (`app/lib/lobbyProtocol.ts`) with unit tests; every received message is parsed and validated there before use.

## Invitation payload (`peers.inviteAsync` payload)

```json
{ "v": 1, "lobbyId": "…", "game": { "title": "Freedoom: Phase 1", "fingerprint": "…" },
  "mode": "deathmatch", "monsters": false, "timeLimit": 10, "map": "E1M1", "skill": 3,
  "visibility": "contacts", "extensionVersion": "1.0.0" }
```

The invitee checks the fingerprint and version before accepting; a mismatch is shown with its reason (FR-030), and the invitation is declined. A player joining by code does not know the lobby yet: the `joinAsync` payload is `{ "v": 1, "extensionVersion" }`, the host answers with a `lobby` message, and the guest then checks the game locally — if it is missing, the guest shows the reason (FR-030) and sends `leave`; otherwise it sends `hello`. `monsters` and `timeLimit` are present only for deathmatch.

## Messages

| Direction | Message | Meaning |
|---|---|---|
| guest → host | `{ "t": "hello", "v": 1, "fingerprint", "extensionVersion", "displayName" }` | First message after the channel opens. The host re-checks fingerprint and version and answers `reject` on mismatch. |
| host → guest | `{ "t": "lobby", "game": { "title", "fingerprint" }, "mode", "monsters"?, "timeLimit"?, "map", "skill", "players": [{ "displayName", "verified", "state" }] }` | Current lobby, sent on every change and right after a join. |
| host → guest | `{ "t": "reject", "reason": "game-missing" \| "version" \| "full" \| "removed" }` | The guest is not admitted or was removed; the host then calls `removeAsync` (removed) or `closeAsync`. |
| host → guest | `{ "t": "start", "nodes": 2-4, "mode", "monsters"?, "timeLimit"?, "map", "skill" }` | Everyone starts the engine; guests with `-connect host`, the host with `-privateserver -nodes N`. |
| any → any | `{ "t": "leave" }` | The sender leaves; the host leaving ends the game (FR-032). |

Unknown `t` values and versions other than `v: 1` are ignored and logged, so a newer peer does not crash an older one.
