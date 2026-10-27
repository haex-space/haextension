# Feature Specification: haex-puzzle — a jigsaw puzzle from your own pictures

**Feature Branch**: `feat/haex-puzzle`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "haex-puzzle: a picture puzzle game as a haextension app. Users open a picture of their own (file selection through the host's file access, as in haex-image) and choose a difficulty that sets the number of pieces. The picture is cut into pieces of the classic jigsaw shape (tabs and blanks), which lie shuffled on the table and are put back together by drag and drop (mouse and touch). Matching pieces snap into place; the game notices when the puzzle is complete. Bilingual (de/en), following the host's theme and locale like the other game apps (haex-tetris, haex-doom)."

## Clarifications

### Session 2026-10-27

- Q: What shape do the pieces have? → A: The classic jigsaw shape, with tabs and blanks that interlock with their neighbours. Plain rectangles are not enough.
- Q: Which workflow? → A: The full Spec Kit cycle (specify → plan → tasks → implement with review gates), as for haex-doom.
- Q: Must a picture be opened again for every puzzle? → A: No. A picture that has been added stays available permanently in a library inside the extension; the user picks it from there for any later puzzle and only needs the device's file selection to add a new one.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cut a picture into a puzzle and solve it with the mouse (Priority: P1)

A vault user opens the "Puzzle" extension on their PC, adds a picture from their device to the library (or picks one that is already there), chooses a difficulty, and the picture is cut into jigsaw pieces that lie shuffled around the table. The user drags the pieces with the mouse to rebuild the picture. A piece dropped close to where it belongs snaps into place and stays there. When the last piece is placed the game shows that the puzzle is complete.

**Why this priority**: This is the whole game. Opening a picture, cutting it into pieces, moving them, snapping them and detecting completion is the smallest thing that is a puzzle; everything else refines it.

**Independent Test**: Install the extension, open a photo, choose "Easy", and solve the puzzle with the mouse only. The completion message appears after the last piece is placed, and no piece could be placed wrongly.

**Acceptance Scenarios**:

1. **Given** the extension is open, **When** the user looks at the start screen, **Then** it shows the picture library (empty on first use), an "Add picture" action and the available difficulties.
2. **Given** the user has chosen a picture and a difficulty, **When** they start the puzzle, **Then** the picture is shown cut into jigsaw pieces, shuffled and spread over the table, and every piece shows its own part of the picture.
3. **Given** a puzzle is running, **When** the user presses on a piece, moves the pointer and releases it, **Then** the piece follows the pointer without lag and stays where it was released.
4. **Given** a piece is dragged, **When** it is released close to the position where it belongs, **Then** it snaps exactly into that position and can no longer be dragged away by accident.
5. **Given** a piece is dragged, **When** it is released near a spot where it does not belong, **Then** it stays where it was dropped and does not snap.
6. **Given** a piece is dragged over other pieces, **When** the user holds it, **Then** it is drawn above all other pieces; and **When** it is released, **Then** it stays on top of the pieces it overlaps.
7. **Given** all pieces are in place, **When** the last one snaps, **Then** the finished picture is shown without piece outlines, together with a completion message and the time it took.

---

### User Story 2 - Choose how hard the puzzle is (Priority: P1)

Before starting, the user chooses a difficulty from a short list. The difficulty sets how many pieces the picture is cut into, from a handful of large pieces for a quick puzzle to a hundred or more small pieces for a long one.

**Why this priority**: The user's request names the difficulty explicitly, and without a choice the same picture always yields the same puzzle. It is P1 because the start screen is not complete without it, but it is independent of the interaction polish in later stories.

**Independent Test**: Open the same picture four times, once at each difficulty, and count the pieces each time. The counts differ in the stated order and each puzzle is solvable.

**Acceptance Scenarios**:

1. **Given** the start screen, **When** the user opens the difficulty list, **Then** it offers four levels (Easy, Medium, Hard, Expert) and shows roughly how many pieces each will produce.
2. **Given** a picture and a difficulty, **When** the puzzle starts, **Then** the number of pieces is within 10 % of the figure shown for that difficulty.
3. **Given** a wide or tall picture, **When** it is cut, **Then** the pieces are (nearly) square and the grid follows the picture's proportions, instead of stretching the pieces.
4. **Given** a puzzle is running, **When** the user chooses "New puzzle", **Then** they return to the start screen and can pick another picture or difficulty, after confirming that the current progress will be lost.

---

### User Story 3 - Keep my pictures in a library (Priority: P1)

Every picture the user adds is kept permanently in a picture library of the extension. On the next visit, the user sees their pictures as thumbnails, picks one, and starts a puzzle without going through the file selection again. Pictures can be removed from the library when the user no longer wants them.

**Why this priority**: The user explicitly asked for this: a picture that has been added must stay available. It also shapes the start screen, so it belongs to the first release.

**Independent Test**: Add two pictures, close the extension completely, and open it again. Both pictures are shown as thumbnails and each starts a puzzle without selecting a file.

**Acceptance Scenarios**:

1. **Given** the user adds a picture, **When** it has been read successfully, **Then** it appears in the library at once as a thumbnail and is offered for the next puzzle.
2. **Given** pictures are in the library, **When** the user closes the extension and opens it again (also after the device or the vault has been restarted), **Then** all pictures are still there, unchanged.
3. **Given** the library shows pictures, **When** the user selects one and a difficulty, **Then** a puzzle starts from it without any file selection.
4. **Given** a picture is in the library, **When** the user removes it and confirms, **Then** it disappears from the library and is not offered any more; a puzzle that is running with it is not interrupted.
5. **Given** the library shows pictures, **When** the user switches to selection mode, marks several pictures (or all of them) and confirms the removal, **Then** exactly the marked pictures disappear from the library in one step, and the confirmation states how many pictures will be removed.
6. **Given** a picture has been removed, **When** the user looks at the library after closing and reopening the extension, **Then** the picture is still gone, the storage it used is free again, and the original file on the device is untouched.
7. **Given** the user adds a picture that is already in the library, **When** it has been read, **Then** it is not added a second time, and the existing entry is shown instead.
8. **Given** the user selects several files at once, **When** they are read, **Then** each usable picture is added, and the unusable ones are listed in a single message.

---

### User Story 4 - Solve the puzzle on a touch device (Priority: P2)

A vault user opens the extension on a phone or tablet and plays the same puzzle with their finger: dragging pieces, with the pieces still big enough to be grabbed on a small screen.

**Why this priority**: The other game extensions are used on mobile too, and a puzzle is a natural touch game. It builds on the P1 puzzle and changes only the input handling and layout.

**Independent Test**: On a phone with no mouse or keyboard, solve an Easy puzzle by touch only.

**Acceptance Scenarios**:

1. **Given** a touch device, **When** the user drags a piece with a finger, **Then** it follows the finger and the page does not scroll, zoom or pull to refresh underneath.
2. **Given** a touch device, **When** the user lets go of a piece near its correct position, **Then** it snaps like it does with the mouse.
3. **Given** a small screen, **When** a puzzle starts, **Then** the whole table is visible without scrolling, and the user can zoom in on a part of it with two fingers and move it to place small pieces precisely.
4. **Given** the device is rotated while a puzzle is running, **When** the layout changes, **Then** no piece is lost, and every piece keeps its position relative to the picture.

---

### User Story 5 - Connected pieces move together (Priority: P2)

When the user fits two pieces that belong next to each other, they join and from then on move as one group. The group can be dragged by any of its pieces, and joins further pieces the same way, until it snaps to the frame of the finished picture.

**Why this priority**: With 100 or more pieces, solving only by snapping every piece to its final spot is tedious, and building the picture from the inside out is how people really solve jigsaws. It is not needed for a playable puzzle, so it ranks after the basics.

**Independent Test**: In a Medium puzzle, put two neighbouring pieces next to each other away from their final position and check that they join and move together afterwards.

**Acceptance Scenarios**:

1. **Given** a piece is released close to a piece that is its neighbour in the picture, **When** their edges meet in the right relative position, **Then** the two join into a group.
2. **Given** a group of joined pieces, **When** the user drags one of its pieces, **Then** the whole group moves and keeps its shape.
3. **Given** a group that is released close to the final position of its pieces, **When** it is dropped, **Then** the whole group snaps into place.
4. **Given** two pieces that are not neighbours in the picture, **When** their edges touch, **Then** they do not join.

---

### User Story 6 - Look at the picture and track my time (Priority: P3)

While solving, the user can show a small preview of the complete picture, hide it again, and see how much time has passed since the puzzle began. The timer pauses when the extension is not visible.

**Why this priority**: Helpful, but the puzzle is solvable without either. The preview is the most useful of the two since the user may not remember the picture well.

**Independent Test**: Start a puzzle, toggle the preview on and off, leave the extension for ten seconds and return; the timer shows the time spent inside the extension only.

**Acceptance Scenarios**:

1. **Given** a puzzle is running, **When** the user turns the preview on, **Then** the complete picture is shown without hiding the table; and **When** they turn it off, **Then** it disappears.
2. **Given** a puzzle is running, **When** the extension window loses focus or becomes hidden, **Then** the timer pauses until it is visible again.
3. **Given** the puzzle has just been completed, **When** the completion message is shown, **Then** it offers "Play again" (same picture, same difficulty, new shuffle) and "New puzzle".

---

### Edge Cases

- The user cancels the file selection: nothing changes, and no error is shown.
- The chosen file is not a picture, is damaged, or is in a format that cannot be decoded: the user sees a clear message that the file cannot be used and can choose another; the library is unchanged.
- The library is large (for example 200 pictures): the start screen still opens quickly and scrolls smoothly, because it shows small thumbnails and not the full pictures.
- Storing a picture fails (for example the vault has no room left): the user is told that the picture could not be kept; nothing half-saved remains in the library, and a puzzle can still be played from the picture for this session.
- The original file is moved or deleted on the device after the picture was added: the library entry still works, because the library holds its own copy.
- A stored picture is damaged or cannot be read any more: its entry is marked as unusable and can be removed, and the other entries are not affected.
- A very large picture (for example a 48-megapixel photo): the puzzle still starts within a few seconds and plays smoothly; the picture is reduced to a size that fits the table without visible loss at the size it is shown.
- A very small picture (for example 100 × 100 pixels) at Expert difficulty: the pieces would be only a few pixels wide; the extension limits the difficulties to the ones that make sense for the picture and says why.
- A picture with transparency: transparent areas are shown on a neutral background instead of leaving holes in the pieces.
- A picture with an extreme aspect ratio (for example a 10:1 panorama): the grid still yields pieces of a usable shape, and the number of pieces stays within the difficulty's range.
- A photo whose orientation is stored in its metadata (a phone portrait photo): it is shown the right way up.
- Two pieces are dropped on exactly the same spot: both remain reachable (the one on top can be moved away).
- The user resizes the window mid-puzzle: pieces keep their relative positions on the table, and none ends up outside the visible area.
- A piece is dragged outside the table: it is kept inside the table's visible area when released.
- The user switches the host theme or language while a puzzle is running: texts and surroundings update, and the puzzle is not reset.
- The user removes every picture in the library: the start screen shows the empty state with the "Add picture" action, as on first use.
- Removing several pictures fails part-way (for example the vault becomes unavailable): the user is told which pictures could not be removed, and those stay in the library, fully usable.
- The user closes the extension mid-puzzle: the puzzle is not kept (see Assumptions), while the library is.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let the user add one or more pictures from their device through the host's file selection, and MUST NOT ask for or use any picture the user did not choose.
- **FR-002**: The system MUST accept the common picture formats (at least PNG, JPEG and WebP) and MUST show a clear message, without losing the current state, when a file cannot be used.
- **FR-003**: The system MUST offer four difficulty levels, each with a stated approximate piece count, and MUST produce a number of pieces within 10 % of that count for any picture on which the level is available.
- **FR-004**: The system MUST cut the picture into pieces of the classic jigsaw shape, so that the tabs and blanks of every pair of neighbouring pieces interlock exactly and the pieces together cover the whole picture without gaps or overlaps.
- **FR-005**: The system MUST vary the tabs and blanks, so that not every piece of a puzzle has the same outline, and MUST give every edge piece a straight outer edge.
- **FR-006**: The system MUST choose the grid so that the pieces are close to square for the picture's proportions.
- **FR-007**: The system MUST show every piece with exactly the part of the picture it covers, including its tabs, with a visible outline that separates it from its neighbours.
- **FR-008**: The system MUST place the pieces shuffled over the table at the start, in a different order each time, without any piece starting at its correct position, and without any piece hidden fully behind another.
- **FR-009**: The user MUST be able to pick up, move and put down a piece with a mouse and with a finger, and the piece MUST follow the pointer for the whole drag.
- **FR-010**: The system MUST draw a piece that is being dragged above all other pieces and keep it above the pieces it overlaps when it is released.
- **FR-011**: The system MUST snap a piece, or a group, to its correct position when it is released within a snapping distance of that position, and MUST NOT let a placed piece be moved by accident afterwards.
- **FR-012**: The system MUST join two pieces that are neighbours in the picture into a group when they are released with their edges meeting, MUST move the group as one when any of its pieces is dragged, and MUST NOT join pieces that are not neighbours.
- **FR-013**: The system MUST detect when every piece is in its place, and MUST then show the finished picture without outlines, a completion message and the elapsed time.
- **FR-014**: The system MUST keep every piece reachable: a piece cannot be released outside the visible table, and no piece can be covered so that it cannot be picked up.
- **FR-015**: The system MUST offer a preview of the complete picture that the user can turn on and off during the puzzle.
- **FR-016**: The system MUST show the elapsed time of the running puzzle and MUST pause it while the extension is not visible or has no focus.
- **FR-017**: The system MUST offer "New puzzle" and "Play again", and MUST ask for confirmation before discarding a puzzle in progress.
- **FR-018**: The system MUST work on desktop and on touch devices, MUST prevent the page from scrolling or zooming while a piece is dragged on a touch device, and MUST let the user zoom and pan the table by touch.
- **FR-019**: The system MUST keep the pieces' positions relative to the picture when the window size or the device orientation changes.
- **FR-020**: The system MUST follow the host's theme (light or dark) and locale, and MUST offer all texts in German and English.
- **FR-021**: The system MUST use an added picture only for the library and the puzzle: it MUST NOT modify or delete the user's original file, and MUST NOT send the picture or any data derived from it anywhere outside the user's vault.
- **FR-022**: The system MUST show a picture's correct orientation when it is stored in the file's metadata.
- **FR-023**: The system MUST keep every added picture permanently in a library of the extension, so that it is available in later sessions, after a restart of the app or device, and without the original file.
- **FR-024**: The system MUST show the library on the start screen as thumbnails, let the user start a puzzle from any entry without the file selection, and MUST keep the start screen responsive with a library of at least 200 pictures.
- **FR-025**: The system MUST let the user remove a single picture, or several marked pictures (including all of them), from the library after confirming how many will be removed, and MUST NOT remove a picture in any other way.
- **FR-026**: The system MUST NOT add a picture to the library twice when the user adds the same picture again, and MUST tell the user when a picture could not be kept, leaving the library unchanged in that case.
- **FR-027**: The system MUST make a removal final: the removed picture, its thumbnail and every other copy the extension holds are deleted, the storage they used is freed, and the user's original file on the device is not touched.

### Key Entities

- **Picture**: An image the user added, kept as a library entry with its own copy of the image, a small thumbnail, its name, width, height, display orientation and the date it was added; it is the source for the pieces and the preview, and the extension never changes the user's original file.
- **Library**: The permanent collection of the user's pictures in the extension; it survives closing the extension and restarting the device.
- **Difficulty**: One of four levels, each with a target piece count and the smallest picture size on which it is available.
- **Puzzle**: One run of the game: a picture from the library, a difficulty, the resulting grid of columns and rows, the set of pieces, the start time and the elapsed time.
- **Piece**: One cut-out of the picture, with its grid position, the shape of its four edges (straight, tab or blank), its current position on the table, and whether it is placed, loose or part of a group.
- **Group**: A set of joined pieces that move as one; a group that has snapped to the frame is placed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from opening the extension to the first piece being moved in under 30 seconds, including choosing a picture and a difficulty; with a picture already in the library, under 15 seconds.
- **SC-002**: A user who has never seen the extension solves an Easy puzzle (about 12 pieces) in under 3 minutes without any help.
- **SC-003**: A puzzle of any difficulty is shown and ready to play within 3 seconds of the user confirming the difficulty, for pictures up to 24 megapixels.
- **SC-004**: While a piece is dragged in an Expert puzzle (about 200 pieces), the piece follows the pointer without visible lag on a mid-range phone released within the last five years.
- **SC-005**: In 100 % of the puzzles, the pieces fit together to exactly the original picture: no gaps, no overlaps, and no visible seams in the finished state.
- **SC-006**: In 100 % of the cases where a piece is released within the snapping distance of its place, it ends up exactly there; and in none of the cases where it is released farther away does it snap.
- **SC-007**: At least 9 of 10 first-time users on a phone manage to pick up and place a piece on the first attempt in an Easy puzzle.
- **SC-008**: Switching theme or language while a puzzle is running leaves the puzzle's state unchanged in 100 % of the cases.
- **SC-009**: 100 % of the pictures added are still in the library, unchanged, after the extension is closed and opened again, and after the device is restarted.
- **SC-010**: In 100 % of the removals, the removed pictures are gone from the library after the extension is closed and opened again, and no picture that was not marked is removed.

## Assumptions

- **Picture source**: Pictures come from the device through the host's file selection, as in haex-image, and are added to the library once. Bundled sample pictures, camera capture and fetching a picture from the internet are out of scope for this feature.
- **Library storage**: The library lives in the user's vault, like the data of other extensions, so it is as persistent as the vault itself; whether it is also available on the user's other devices follows however the vault shares its data and is settled during planning. The library holds its own copy of each picture, so the original file is not needed afterwards. A size limit per picture and for the whole library may apply and is settled during planning.
- **Library scope**: The library holds pictures only; it has no folders, tags, renaming or search in this feature.
- **Difficulty levels**: Easy is about 12 pieces, Medium about 48, Hard about 108 and Expert about 192. These counts are a starting point for planning and can be tuned after trying the game on real pictures and devices.
- **No saved games**: Only the pictures are kept permanently. A puzzle in progress is not kept when the extension is closed; the user starts a new one from the library. Saving and resuming a puzzle, high scores and best times are out of scope for this feature and can follow later.
- **Single player, no network**: The puzzle is played alone on one device. Shared or cooperative puzzles are out of scope.
- **No piece rotation**: Pieces are never rotated, only moved; every piece starts the right way up. Rotating pieces is a possible harder mode for a later feature.
- **Permissions**: The extension needs read access to the user's files, to read the pictures the user selects, and storage in the vault for the library. It needs no write access to the user's files, no network and no shell.
- **Same look as the other games**: The surroundings (buttons, dialogs, messages) use the shared haex UI components and follow the host's theme, as in haex-tetris; the pieces are drawn from the user's picture, not from bundled artwork.
- **Languages**: German and English, with German as the default, like the other extensions.
- **Supported pictures**: Whatever picture formats the host can decode; PNG, JPEG and WebP must work. Animated pictures are shown by their first frame.
- **Dependencies**: Requires the host's file selection and file reading (as already used by haex-image), the vault's data storage for the library, and the shared haex UI package.
