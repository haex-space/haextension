# Feature Specification: haex-doom — DOOM as a haextension

**Feature Branch**: `020-haex-doom`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "New haextension "haex-doom": DOOM playable inside haex-vault on desktop (PC) and mobile devices (Android/iOS). Engine: Chocolate DOOM (GPL-2.0), compiled to WebAssembly, upstream pinned to a fixed commit, browser adaptations modelled on Cloudflare's doom-wasm. The extension itself is GPL-2.0. Game data: Freedoom (BSD) and the DOOM shareware episode (doom1.wad, unmodified) are bundled; users can import their own WAD files (e.g. DOOM.WAD, DOOM2.WAD), which are stored in the vault and never bundled. Desktop controls: keyboard and mouse (mouse look via pointer lock), optional gamepad. Mobile controls: touch overlay (virtual stick on the left for moving/strafing, swipe on the right to turn, buttons for fire, use, weapon switch, automap, menu), landscape, haptics, gamepad support. Sound and music included; audio is unlocked by a start screen through a user gesture. Save games and settings persist through the vault SDK, since the extension iframe runs without allow-same-origin. Dependency in haex-vault (separate repo, separate PR): the extension iframe needs allow-pointer-lock in its sandbox and allow="fullscreen", possibly tied to a manifest permission. Structural models: apps/haex-tetris and apps/haex-game-unicorn."

## Clarifications

### Session 2026-10-22

- Q: Are modification files (PWADs) in scope? → A: No. They are nice to have and may stay out of this feature.
- Q: Is multiplayer in scope? → A: Yes. It matters for demonstrations, and it runs peer to peer between vaults over their existing iroh connections.
- Q: Which engine? → A: Crispy DOOM instead of Chocolate DOOM, after comparing Boom-compatible engines (see Assumptions).
- Planning (research R-8, R-10, R-12): no local-network discovery, because players on one network connect directly through the vault's peer connections anyway; a player in the background is dropped after the engine's own 30-second timeout; imported game files stay on the device they were imported on.
- Q: From whom may a vault accept game invitations and joins? → A: The host sets each lobby's visibility. "Contacts only" (default): only the host's contacts may join, by invitation or join code. "Public": anyone holding the lobby's join code may join. Invitations (pushed into another vault) go only to contacts, and the recipient's vault accepts them only from its own contacts. The join code carries a per-lobby secret, not just the device address, and expires when the lobby starts or closes.
- Q: On which devices does an invitation appear when the invited contact has several devices with an open vault? → A: On all reachable devices at once; the first acceptance wins and the invitation is withdrawn on the others.
- Q: Which deathmatch rules can the host set? → A: Deathmatch always uses the "2.0" rules (items respawn); the host sets monsters on/off (default off) and a time limit of off, 10, or 20 minutes (default 10).
- Q: Which save game remains when the same slot is saved on two devices before they sync? → A: The most recently saved one (by save time); the older one is overwritten.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Play DOOM on the desktop with the keyboard (Priority: P1)

A vault user opens the "DOOM" extension on their PC, picks one of the bundled games (Freedoom or the DOOM shareware episode) on a start screen, and plays it with the keyboard, hearing sound effects and music.

**Why this priority**: This is the core of the feature. Without a running game with sound there is nothing else to build on, and the keyboard is the one input that works without any change to haex-vault.

**Independent Test**: Install the extension in a current haex-vault on a desktop, start the shareware episode, and play through the first level using only the keyboard while sound effects and music are audible.

**Acceptance Scenarios**:

1. **Given** the extension is installed and no game data has been imported, **When** the user opens it, **Then** a start screen lists Freedoom and the DOOM shareware episode as available games.
2. **Given** the start screen is shown, **When** the user selects a game and confirms, **Then** the game's title screen appears and its music plays.
3. **Given** a level is running, **When** the user uses the standard DOOM keyboard controls (arrows/WASD to move, Ctrl to fire, Space/E to use, number keys for weapons, Tab for the automap, Esc for the menu), **Then** the game responds to each input without noticeable delay.
4. **Given** a single-player level is running, **When** the extension window loses focus, **Then** the game pauses and its audio stops until the window is focused again.

---

### User Story 2 - Play DOOM on a phone or tablet with touch controls (Priority: P2)

A vault user opens the extension on an Android or iOS device, starts a game, and plays it entirely by touch, holding the device in landscape.

**Why this priority**: Mobile play is an explicit goal and the main differentiator from just running DOOM on a PC; it is useless without US1's running game, so it comes second.

**Independent Test**: On a phone with no keyboard, mouse, or gamepad, start the shareware episode and finish its first level using only the on-screen touch controls.

**Acceptance Scenarios**:

1. **Given** a touch-only device, **When** a level is running, **Then** an on-screen control overlay is shown with a movement stick on the left, a turning area on the right, and buttons for fire, use, next/previous weapon, automap, and menu.
2. **Given** the overlay is shown, **When** the user drags the left stick, **Then** the player moves forward/backward and strafes proportionally to the stick's deflection.
3. **Given** the overlay is shown, **When** the user swipes horizontally in the turning area, **Then** the player turns proportionally to the swipe distance, and this works while the left thumb is moving at the same time.
4. **Given** the device supports vibration, **When** the user fires or takes damage, **Then** the device gives short haptic feedback, unless the user has turned haptics off.
5. **Given** the device is held in portrait, **When** a level is running, **Then** the game asks the user to rotate the device to landscape.
6. **Given** a keyboard or gamepad is connected to the mobile device, **When** the user presses a key or button on it, **Then** the touch overlay hides and the external input is used.

---

### User Story 3 - Play together with other vault users (Priority: P3)

A user starts a multiplayer game and lets one to three people join: by inviting them from their vault contacts or by sharing a join code, which in a public game works for anyone; everyone joins from their own device — desktop or mobile — and they play cooperatively or against each other.

**Why this priority**: Multiplayer is what makes the extension worth demonstrating: it shows vaults talking directly to each other. It builds on US1 and US2 and needs the peer-to-peer channel from haex-vault (FR-036 to FR-038).

**Independent Test**: Two vaults on different networks, one desktop and one phone, start a cooperative game of Freedoom via a contact invitation and play a level together; then repeat with four players in deathmatch.

**Acceptance Scenarios**:

1. **Given** the start screen, **When** the user chooses "Multiplayer", **Then** they can pick a game, a mode (cooperative or deathmatch), a starting map, a skill level, and a visibility (contacts only or public), and open a lobby that shows its join code.
2. **Given** an open lobby, **When** the host invites a vault contact, **Then** that contact receives an invitation in their vault naming the host, the game, and the mode, and can accept or decline it; if the contact has several devices with an open vault, the invitation appears on all of them, and once it is accepted on one, it disappears from the others.
3. **Given** an open public lobby, **When** someone who is not the host's contact enters its join code, **Then** they join the lobby under the display name they chose, marked as not verified.
4. **Given** an open contacts-only lobby, **When** someone who is not the host's contact enters its join code, **Then** they are refused with a message that only the host's contacts may join.
5. **Given** a lobby, **When** the host removes a player, **Then** that player leaves the lobby and cannot rejoin it with the same code until the host opens a new lobby.
6. **Given** every player in the lobby has the selected game file, **When** the host starts the game, **Then** all players enter the same map at the same time.
7. **Given** a joining player does not have the selected game file (e.g. an imported commercial game they do not own), **When** they try to join, **Then** they are told which game is missing and are not admitted; the extension never transfers that file between players.
8. **Given** a game in progress, **When** a guest leaves or loses their connection, **Then** the remaining players continue and see a notice; **When** the host leaves, **Then** the game ends for everyone with a notice.
9. **Given** players on different devices, **When** they play, **Then** each player's game reacts to their own input as quickly as the connection allows, and all players see the same events in the same order.

---

### User Story 4 - Keep save games and settings (Priority: P4)

A user saves their progress, closes the extension or restarts the vault, and later continues from the save; their control and audio settings are still as they left them.

**Why this priority**: DOOM is playable without saves, but losing progress on every restart makes longer sessions frustrating, especially on mobile where apps are closed often.

**Independent Test**: Save in a level, close and reopen the vault, load the save, and confirm the same level, position, health, and inventory, with settings unchanged.

**Acceptance Scenarios**:

1. **Given** a running single-player game, **When** the user saves into a slot via the in-game menu, **Then** the save is still listed and loadable after the extension and the vault are restarted.
2. **Given** saves exist for several games (e.g. Freedoom and the shareware episode), **When** the user opens the load menu in one game, **Then** only that game's saves are listed.
3. **Given** the user changed settings (volume, mouse/turn sensitivity, haptics), **When** the extension is reopened, **Then** the settings are restored.
4. **Given** the vault syncs between the user's devices, **When** the user saves on one device, **Then** the save becomes available on their other devices once the vault has synced.

---

### User Story 5 - Import one's own DOOM game files (Priority: P5)

A user who owns commercial DOOM (e.g. "The Ultimate DOOM" or "DOOM II") imports their game file once, and from then on it appears on the start screen next to the bundled games.

**Why this priority**: Owners of the full game want to play it, but the bundled games already provide a complete experience, so this follows the core play loop.

**Independent Test**: Import a legally owned DOOM II game file, restart the extension, and start a game of DOOM II from the start screen.

**Acceptance Scenarios**:

1. **Given** the start screen, **When** the user chooses "Import game file" and selects a valid DOOM game file, **Then** the file is stored in the vault and listed on the start screen under its recognised game title (e.g. "DOOM II").
2. **Given** the user selects a file that is not a DOOM base game file, **When** the import runs, **Then** nothing is stored and the user sees a message explaining that the file is not a supported game file.
3. **Given** the user imports a file identical to one already imported, **When** the import runs, **Then** no duplicate is created and the user is told the game is already available.
4. **Given** an imported game is listed, **When** the user removes it, **Then** it disappears from the start screen and its storage is freed; its save games are kept until the user removes them too.

---

### User Story 6 - Mouse look and fullscreen on the desktop (Priority: P6)

A desktop user plays with mouse and keyboard the way DOOM is commonly played today: the mouse turns the player and fires, the cursor is captured while playing, and the game can fill the screen.

**Why this priority**: It greatly improves desktop play but requires a change in haex-vault; the game is fully playable by keyboard without it.

**Independent Test**: In a haex-vault version that allows pointer capture and fullscreen for extensions, click into a running level, turn by moving the mouse, fire with the left button, press Esc to release the cursor, and toggle fullscreen.

**Acceptance Scenarios**:

1. **Given** a running level on a vault that allows pointer capture, **When** the user clicks into the game, **Then** the cursor is captured and horizontal mouse movement turns the player.
2. **Given** the cursor is captured, **When** the user presses Esc, **Then** the cursor is released and the game menu opens.
3. **Given** a vault that allows fullscreen, **When** the user activates fullscreen, **Then** the game fills the screen, and leaving fullscreen returns to the previous window.
4. **Given** a vault version that does not allow pointer capture or fullscreen, **When** the extension runs, **Then** the game remains fully playable by keyboard and the unavailable options are hidden rather than failing.

---

### User Story 7 - Play with a gamepad (Priority: P7)

A user connects a gamepad on desktop or mobile and plays with it without configuring anything.

**Why this priority**: A convenience for a subset of users; keyboard, mouse, and touch already cover every device.

**Independent Test**: Connect a standard gamepad, start a level, and play through it using only the gamepad.

**Acceptance Scenarios**:

1. **Given** a connected standard gamepad, **When** a level is running, **Then** the left stick moves/strafes, the right stick turns, a trigger fires, and face buttons use, switch weapons, and open the menu.
2. **Given** a gamepad is disconnected during single-player play, **When** that happens, **Then** the game pauses and the previously used input method is active again.

---

### Edge Cases

- The selected file for import is not a base game file (wrong format, truncated, or a modification file that needs a base game): the import is rejected with an explanation and nothing is stored.
- The selected file is very large or the vault lacks storage space: the import fails with a clear message and no partial file remains.
- Saving fails because the vault cannot be written: the user sees that the save did not succeed and the game keeps running, with no existing save overwritten or corrupted.
- The same slot is saved on two devices while they are not in sync: after syncing, the slot holds the later save only (FR-046).
- An imported game file was removed but save games for it remain: those saves are not offered in other games, and they become usable again if the same game file is imported again.
- The extension is opened on a vault version without pointer capture, fullscreen, or the peer-to-peer channel: those features are hidden and single-player keyboard (or touch) play works normally.
- The browser engine blocks audio until a user gesture: the start screen's start action unlocks audio, so the game never starts silently.
- The app is sent to the background on mobile, or the device is locked, during a single-player game: the game pauses and audio stops; on return it stays paused until the user continues.
- The same happens during a multiplayer game: the game cannot pause for everyone, so that player stands still while the others continue; if they do not return within 30 seconds, they are dropped as if they had left.
- The window is resized or the device is rotated during play: the picture rescales to the new size, keeps its aspect ratio, and the touch overlay repositions without restarting the level.
- Players in a lobby run different versions of the extension: joining is refused with a message asking the outdated player to update.
- The players' games diverge (a consistency failure): the game ends for everyone with a notice instead of continuing in different states.
- A direct connection between two players cannot be established: the connection falls back to a relay, and the game still starts.
- An invited contact has not installed the extension: the host is told that the contact cannot join.
- A join code is mistyped, belongs to a lobby that has started or closed, or carries a wrong secret: joining fails with "This game is no longer open" and nothing else is revealed about the host.
- Someone tries to invite a user whose vault does not list them as a contact: the recipient's vault refuses the invitation and the inviter sees that the contact could not be reached.
- A public lobby is open: the lobby tells the host that other players can see their network address when they connect directly.

## Requirements *(mandatory)*

### Functional Requirements

**Game and content**

- **FR-001**: The extension MUST run the original DOOM game logic so that levels, enemies, weapons, and recorded demos behave like the original DOS release.
- **FR-002**: The extension MUST ship Freedoom (Phase 1 and Phase 2) and the unmodified DOOM shareware episode as ready-to-play games.
- **FR-003**: The extension MUST NOT ship any commercial DOOM game file.
- **FR-004**: The extension MUST show a start screen listing every available game (bundled and imported) with its recognised title, and start the chosen game.
- **FR-005**: The extension MUST play sound effects and music, and MUST begin audio only after a user gesture on the start screen so that no platform mutes it.
- **FR-006**: In single-player games, the extension MUST pause the game and stop audio when it loses focus, is hidden, or the device is locked.
- **FR-007**: The game picture MUST fill the available space on any window size or orientation without distortion, using the extra width on wide screens.

**Controls**

- **FR-008**: On desktop, the extension MUST support the standard DOOM keyboard controls listed in US1, including a WASD layout.
- **FR-009**: When the vault allows pointer capture, the extension MUST support mouse turning and mouse-button fire with capture on click and release on Esc; when it does not, mouse options MUST be hidden.
- **FR-010**: When the vault allows fullscreen, the extension MUST offer a fullscreen toggle; when it does not, the toggle MUST be hidden.
- **FR-011**: On touch devices, the extension MUST show a control overlay with a movement stick, a turning area, and buttons for fire, use, previous/next weapon, automap, and menu, all usable with several fingers at once.
- **FR-012**: The touch overlay MUST NOT cover the centre of the picture where enemies appear, and MUST be usable with one thumb per side in landscape.
- **FR-013**: On touch devices, the extension MUST ask the user to rotate to landscape while in portrait during play.
- **FR-014**: The extension MUST give short haptic feedback on fire and damage on devices that support it, and MUST let the user turn haptics off.
- **FR-015**: The extension MUST support standard gamepads with a default mapping and without configuration, on desktop and mobile.
- **FR-016**: The extension MUST hide the touch overlay while a keyboard, mouse, or gamepad is in use, and show it again on the next touch.
- **FR-017**: Users MUST be able to adjust turning sensitivity (mouse and touch), music volume, and effects volume.

**Persistence**

- **FR-018**: The extension MUST store save games, per game, in the user's vault so that they survive restarts of the extension and the vault and follow the vault's sync between devices.
- **FR-019**: The extension MUST store user settings in the user's vault and restore them on start.
- **FR-020**: A failed save MUST be reported to the user and MUST NOT damage existing saves.
- **FR-046**: When the same game and slot are saved on two devices before they sync, the most recently saved game MUST remain after syncing and the older one MUST be replaced; a slot MUST never show two saves.

**Imported game files**

- **FR-021**: Users MUST be able to import a DOOM-engine base game file (e.g. The Ultimate DOOM, DOOM II, Final DOOM) from their device into the vault.
- **FR-022**: The extension MUST validate an imported file before storing it and MUST reject files that are not base game files, explaining why.
- **FR-023**: The extension MUST recognise the game an imported file belongs to and list it under that title.
- **FR-024**: The extension MUST NOT store the same game file twice.
- **FR-025**: Users MUST be able to remove an imported game file; its saves stay until removed separately.
- **FR-026**: Imported game files MUST remain inside the user's vault and MUST NOT be sent to any other party by the extension, including other players.

**Multiplayer**

- **FR-027**: Users MUST be able to host a multiplayer game for 2 to 4 players in cooperative or deathmatch mode, choosing game, starting map, and skill level. Deathmatch MUST use the "2.0" rules (picked-up items respawn); for deathmatch the host MUST be able to set monsters on/off (default off) and a time limit of off, 10, or 20 minutes (default 10), after which the level ends and the frag table is shown.
- **FR-028**: The host MUST be able to invite vault contacts; an invited contact MUST explicitly accept before joining. A vault MUST accept invitations only from its own contacts. An invitation MUST be delivered to all of the contact's reachable devices at once; the first acceptance wins and the invitation MUST be withdrawn on the other devices.
- **FR-042**: The host MUST choose each lobby's visibility: "contacts only" (default) or "public".
- **FR-043**: Each open lobby MUST have a join code that the host can copy and share; it MUST contain a random per-lobby secret and MUST stop working when the lobby starts its game or closes.
- **FR-044**: In a contacts-only lobby, only the host's contacts MUST be able to join with the code; in a public lobby, anyone with the code MAY join, shown with their self-chosen name marked as not verified.
- **FR-045**: The host MUST be able to remove a player from the lobby; a removed player MUST NOT be able to rejoin that lobby.
- **FR-029**: *(withdrawn in planning, see research R-12: players on the same network are invited as contacts and connect directly.)*
- **FR-030**: Before admitting a player, the extension MUST check that the player has the same game file (by content fingerprint) and a compatible extension version, and MUST tell them precisely why they cannot join otherwise.
- **FR-031**: Desktop and mobile players MUST be able to play in the same game.
- **FR-032**: A guest leaving or losing connection MUST NOT end the game for the others; the host leaving MUST end it for everyone, with a notice in both cases.
- **FR-033**: A player whose extension is in the background for more than 30 seconds during a multiplayer game MUST be dropped as if they had left.
- **FR-034**: When the players' game states diverge, the game MUST end for everyone with a notice rather than continue inconsistently.
- **FR-035**: Multiplayer traffic MUST travel only between the players' vaults, directly where possible and through a relay otherwise, and MUST be encrypted end to end.

**Platform and distribution**

- **FR-036**: The extension MUST run on every platform haex-vault supports (Linux, Windows, macOS, Android, iOS); single-player play MUST NOT need network access.
- **FR-037**: The extension MUST be distributed under the GPL-2.0 licence, show the licence and credits (DOOM engine, Freedoom, shareware notice) in an "About" view, and make its corresponding source available.
- **FR-038**: The extension MUST request only the vault permissions it needs for storing game files, saves, and settings, reading contacts for invitations, and opening multiplayer connections.

**haex-vault and vault SDK (dependencies, separate changes)**

- **FR-039**: haex-vault MUST allow extensions to capture the pointer and to enter fullscreen, either for all extensions or for those that declare it in their manifest; capture and fullscreen MUST always be ended by the user with Esc.
- **FR-040**: haex-vault and the vault SDK MUST give an extension that declares it in its manifest a message channel to the same extension on other vaults' devices, reachable via the user's contacts or via a join code the extension's lobby issued, with low-latency delivery that tolerates message loss.
- **FR-041**: haex-vault MUST open such a channel only to peers the user chose (an accepted invitation) or that present a valid join code of an open lobby (and, for contacts-only lobbies, are contacts); it MUST accept connections from non-contacts only while a public lobby is open, MUST drop connections that do not present a valid code within a few seconds, and MUST keep extensions isolated from each other and from the vault UI after these changes.

### Key Entities *(include if feature involves data)*

- **Game file**: A base game the user can play. Bundled or imported; has a recognised title (e.g. "DOOM II", "Freedoom: Phase 1"), a content fingerprint used for duplicate detection, matching saves, and checking multiplayer compatibility, and its size. Imported game files live in the vault on the importing device.
- **Save game**: A saved single-player state. Belongs to exactly one game file (by fingerprint), has a slot number, the name the user typed, and the time it was saved.
- **Settings**: The user's preferences for this extension: volumes, turning sensitivities, haptics on/off, and the most recently played game.
- **Lobby**: An open multiplayer game before it starts. Has a host, the chosen game file (by fingerprint), mode, starting map, skill level, for deathmatch the monster switch and time limit, visibility (contacts only or public), a join code, and up to four players with their join state (invited, joined, declined, removed) and whether they are a verified contact.
- **Invitation**: A host's offer to a contact to join a lobby. Has sender, recipient, lobby summary, and a state (pending, accepted, declined, expired).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From opening the extension, a user reaches a playable first level of a bundled game in under 15 seconds, including the start-screen tap.
- **SC-002**: The game runs at its full original speed (35 game updates per second) without audible stutter on a mid-range phone released in the last four years and on any desktop haex-vault supports.
- **SC-003**: A tester with no prior instructions finishes the first level of the shareware episode on a touch-only phone within 10 minutes.
- **SC-004**: 100 % of saves made in a test series of 20 saves across restarts load back to the same level, health, and inventory.
- **SC-005**: Importing a 15 MB game file takes under 30 seconds and the game is listed on the start screen right after.
- **SC-006**: 100 % of non-game files in a test set (images, documents, truncated game files, modification files) are rejected without storing anything.
- **SC-007**: On a vault without the pointer-capture, fullscreen, or peer-to-peer changes, the extension starts and single-player play is fully playable, with no visible errors.
- **SC-008**: From sending an invitation or sharing the join code to all players standing in the first map takes under 60 seconds when the other players act promptly.
- **SC-009**: Four players, mixing desktop and mobile, finish a 10-minute deathmatch on stable connections without a consistency failure or a dropped player.
- **SC-010**: With players connected directly within the same country, at least 4 of 5 testers report no noticeable input delay; with a connection round trip of up to 150 ms, the game still runs at full speed.

## Assumptions

- Target users are vault owners on Linux, Windows, macOS, Android, and iOS; the extension follows the structure of the existing games haex-tetris and haex-game-unicorn.
- The game engine is Crispy DOOM (GPL-2.0), pinned to a fixed upstream commit and adapted for the browser following Cloudflare's doom-wasm. Crispy DOOM shares Chocolate DOOM's code base, build dependencies, and network code, so the port is as proven as Chocolate DOOM's, and it adds raised limits, widescreen, and smooth frame rates. Woof! was considered: it supports Boom/MBF21 mods and shares the same network code, but depends on SDL3 and OpenAL Soft and has no browser port yet, so it carries more porting risk for a benefit (mods) that is out of scope. DSDA-Doom was rejected for lack of suitable network play.
- The engine's GPL-2.0 licence makes the extension GPL-2.0. This applies only to the new extension, not to other apps in the repository.
- Freedoom's licence (BSD-style) and the DOOM shareware licence allow bundling the unmodified files; commercial game files are the user's responsibility to obtain.
- Imported game files are stored in the vault on the device they were imported on and are not synced, because they are large and copyrighted; a user imports them once per device. A full DOOM II file is about 14 MB.
- Modification files (PWADs) are out of scope for this feature; a later feature may add them, possibly with a Boom-compatible engine.
- Multiplayer uses the DOOM engine's own lockstep network play, which exchanges only player input (a few hundred bytes per second per player), carried over the vaults' existing iroh connections. Saving is not offered during multiplayer, as in the original.
- Touch-control layout is fixed in this feature (no drag-to-rearrange); sensitivity and haptics are adjustable.
- Mouse look and fullscreen (US6) need the haex-vault change in FR-039; multiplayer (US3) needs the haex-vault and vault-SDK changes in FR-040 and FR-041. Each is delivered as its own pull request in those repositories. All other stories work with the current vault.
- Saves and settings must use the vault rather than browser storage, because extensions run in an isolated frame without their own browser storage.
