# Feature Specification: haex-mail — drafts that save themselves

**Feature Branch**: `022-haex-mail-drafts`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: "haex-mail: save drafts at once. Every mail that is started in the compose dialog is saved as a draft right away and continuously, like a message in a chat, so that no work is ever lost. Today a draft is saved only when the closing button is used (IMAP append to the drafts folder); discarding, a lost window or a crash loses the text. Goal: when a new mail is opened (for example by a mailto: link through the opener of holzi, spec 063, haex-space/haextension#165), the text already started is present as a draft and is neither replaced nor discarded; the new mail begins as a draft of its own. Open decisions for the spec to settle or default: several drafts side by side with a list in the interface; where the draft lives (first locally in the database of haex-mail, because an IMAP append on every keystroke burdens the server and fails offline) and when it moves to the drafts folder of the server; what sending does to the local and the already uploaded draft (both vanish). Not in scope: synchronising local drafts between devices, attachments beyond today's behaviour."

## Clarifications

### Session 2026-10-30

- Q: Does a new mail replace the draft that is open? → A: No. Every mail is a draft of its own, and several drafts exist side by side. A mail link that arrives while the dialog holds a mail starts a second draft; the first stays.
- Q: Where does a draft live while it is written? → A: First in haex-mail itself, on this device, so that saving needs no connection and no server round trip on every change. The copy in the drafts folder of the mail server follows (see FR-007).
- Q: When does the copy reach the drafts folder of the server? → A: When the dialog closes and after a pause of 30 seconds without a change; not on every change.
- Q: What does sending do to the draft? → A: The draft is gone afterwards, the local one and any copy already in the drafts folder of the server.
- Context 2026-10-30: the closing button already saves a draft to the server today, and a draft that sits in the drafts folder cannot be opened again in haex-mail; it can only be seen in the folder list. Continuing a draft is therefore part of this feature, not an extra.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Nothing I type is ever lost (Priority: P1)

A person starts a mail in haex-mail, types a few paragraphs, and then the window closes, the app is shut down, the device runs out of battery or the program crashes before they press send or close. When they open haex-mail again, the mail is there as a draft, with the text as it was a moment before the interruption.

**Why this priority**: This is the point of the feature. Everything else builds on the fact that a started mail exists as a draft from the first typed character on.

**Independent Test**: Open the compose dialog, type a recipient, a subject and some text, stop the extension without closing the dialog (end the process), start haex-mail again: a draft with that recipient, subject and text is listed and can be continued.

**Acceptance Scenarios**:

1. **Given** the compose dialog is open and empty, **When** the person types the first character in any field, **Then** a draft exists within one second of the last change, without any action of the person.
2. **Given** a draft is being written, **When** the person keeps typing, **Then** the draft follows the changes and the person sees no delay or interruption while typing.
3. **Given** a mail is being written, **When** the extension stops without a clean close, **Then** after the next start the mail is listed as a draft with the content it had at most one second before.
4. **Given** the person chooses to discard the mail, **When** it holds content, **Then** they are asked once whether to delete the draft, and only an agreement deletes it.
5. **Given** the dialog is open and empty, **When** the person closes it without typing, **Then** no draft is left behind.

---

### User Story 2 - A new mail never replaces the one I am writing (Priority: P1)

A person is writing a mail in haex-mail. In the meantime they tap a mail link in another app or on a contact (spec 063) and choose haex-mail. The mail they were writing stays as a draft, and a new mail opens with the recipient, subject and text of the link.

**Why this priority**: This is the case that raised the feature: without it, a link silently overwrites an unsent mail, or the extension has to ask a question at a moment the person did not choose.

**Independent Test**: Start a mail and type text, then hand haex-mail a mail link through the opener: the dialog shows the link's fields, and the earlier mail is in the list of drafts with its full text.

**Acceptance Scenarios**:

1. **Given** a mail with content is open, **When** a mail link arrives, **Then** the mail stays as a draft and a new draft opens with the fields of the link.
2. **Given** a mail link has opened a new draft, **When** the person closes the dialog, **Then** both drafts are in the list.
3. **Given** the compose dialog is closed, **When** a mail link arrives, **Then** a new draft opens as before; no earlier draft is touched.
4. **Given** the person starts a new mail by hand (compose button) while a mail is open, **Then** the same happens: the open mail stays as a draft, a new one starts.

---

### User Story 3 - Find my drafts and continue them (Priority: P1)

A person sees all their unsent mails in one place and opens any of them in the compose dialog to continue writing, with recipients, subject, text and attachments as they were left. Several drafts can exist at the same time, from different accounts.

**Why this priority**: Saved drafts are worth nothing if they cannot be opened again. Today a draft in the drafts folder cannot be continued in haex-mail at all.

**Independent Test**: Create two drafts, close the dialog, open the list of drafts, open one of them: the dialog shows exactly its content, and the other draft stays untouched.

**Acceptance Scenarios**:

1. **Given** drafts exist, **When** the person opens the drafts of an account (the drafts folder), **Then** the local drafts appear there next to the drafts that are only on the server, newest first, each with recipient, subject and the time of its last change.
2. **Given** a draft in the list, **When** the person opens it, **Then** the compose dialog shows its recipients, subject, text and attachments and further changes go to the same draft (no copy).
3. **Given** drafts of several accounts, **When** the unified view is shown, **Then** all drafts appear, and each keeps the account it will be sent from.
4. **Given** a draft in the list, **When** the person deletes it, **Then** it is gone from the list and, if it had been uploaded, from the drafts folder of the server.

---

### User Story 4 - The server's drafts folder holds my drafts too (Priority: P2)

A person who uses another mail program on the same account sees the drafts of haex-mail in that program's drafts folder, so a mail started in haex-mail can be finished elsewhere. A person without a connection keeps writing without any error.

**Why this priority**: Drafts living only on one device would be a step back for those who read the same account elsewhere; but it adds nothing to the core promise and fails gracefully, so it comes after the first three.

**Independent Test**: Write a draft, close the dialog while connected: the draft is in the drafts folder of the server. Write a draft offline: no error appears, the draft is kept, and it reaches the folder once the connection is back.

**Acceptance Scenarios**:

1. **Given** a draft and a connection to the account, **When** the dialog closes, **Then** the draft is in the drafts folder of the server, as one message that is replaced (not duplicated) by later saves.
2. **Given** no connection, **When** the person writes or closes the dialog, **Then** no error interrupts them, the draft is kept locally, and it is uploaded when the account can be reached again.
3. **Given** a draft was changed after its last upload, **When** the next upload happens, **Then** the folder holds the newer version only.
4. **Given** the account has no drafts folder, **When** the draft cannot be uploaded, **Then** the draft stays local and the person can still continue it; the missing folder is shown once, not on every change.

---

### User Story 5 - Sending closes the books (Priority: P2)

A person sends a mail. The draft is gone, and the drafts folder of the server holds no leftover copy, so the same mail is not offered again.

**Why this priority**: Without it the new behaviour fills the list with mails that were long sent.

**Independent Test**: Write a draft until it is uploaded, send it: the list of drafts and the drafts folder of the server no longer have it.

**Acceptance Scenarios**:

1. **Given** a draft that was never uploaded, **When** it is sent, **Then** it is gone from the list.
2. **Given** a draft that was uploaded, **When** it is sent, **Then** it is gone from the list and from the drafts folder of the server.
3. **Given** sending fails, **When** the error is shown, **Then** the draft stays and the person can try again.

---

### Edge Cases

- **Empty mail**: A dialog in which nothing was typed leaves no draft. A draft whose every field the person emptied again is removed (FR-002).
- **Content only in attachments**: A mail with an attachment and nothing else counts as content.
- **Mail link with fields**: A draft opened by a link starts with the link's fields and exists from the moment it opens, even if the person types nothing, because the link already gave it content.
- **Two windows**: Two open haex-mail windows on the same vault never write the same draft at the same moment; the later save wins and no draft is duplicated.
- **Very large mail**: A draft with a body or attachments beyond the limits of today's saved draft is kept as far as today's draft would be; what cannot be kept is said once, and the dialog stays usable.
- **Draft changed on the server**: A draft that another program changed in the drafts folder is not overwritten by an old local version without notice; the newer server version wins and the local one is kept as a second draft (see Assumptions).
- **Account removed**: Drafts of a removed account are removed with it.
- **Draft count**: The list has no limit of its own; the person deletes what they no longer need.
- **Crash during a save**: A save that was cut off never leaves a half-written draft; the previous version stays.

## Requirements *(mandatory)*

### Functional Requirements

**Saving**

- **FR-001**: Every mail that has content MUST exist as a draft without any action of the person, at most one second after the last change.
- **FR-002**: A mail without content MUST NOT leave a draft; a draft whose content is removed again MUST be removed.
- **FR-003**: Saving MUST NOT slow typing or interrupt the person, and MUST NOT need a connection.
- **FR-004**: A draft MUST keep the account it is sent from, the recipients (to, cc, bcc), the subject, the text with its formatting, the attachments, and the message it answers or forwards, so that a reply stays a reply.

**Several drafts**

- **FR-005**: Drafts MUST exist side by side. Starting a new mail (by hand, or by a mail link of spec 063) while a mail is open MUST keep the open mail as a draft and start a new one; it MUST NOT replace, discard or ask.
- **FR-006**: A mail link of spec 063 MUST open a new draft with its fields and MUST leave all other drafts unchanged.

**Server copy**

- **FR-007**: A draft MUST be copied to the drafts folder of its account on the mail server when the dialog closes and after a pause in typing (30 seconds without a change), so that other programs on the account see it soon and a crash loses at most that pause on the server; the copy MUST NOT happen on every change.
- **FR-008**: The copy MUST be one message per draft: later saves replace it, and sending or deleting the draft removes it. Duplicates MUST NOT accumulate in the folder.
- **FR-009**: Without a connection, or without a drafts folder, the draft MUST stay local without an error that interrupts writing; an upload that could not happen MUST be retried when the account can be reached.

**Finding and continuing**

- **FR-010**: The drafts of an account (its drafts folder) MUST list the local drafts together with the drafts that are only on the server, newest first, each with recipient, subject and the time of the last change; the unified view MUST list the drafts of all accounts.
- **FR-011**: A person MUST be able to open any draft in the compose dialog and continue it; further changes MUST go to the same draft.
- **FR-012**: A person MUST be able to delete a draft, which removes the local draft and its copy on the server.
- **FR-013**: Discarding a mail that has content MUST ask once whether to delete the draft; closing the dialog MUST keep the draft and MUST NOT ask.

**Sending**

- **FR-014**: Sending a draft MUST remove it, local and on the server, once the send succeeded; a failed send MUST leave the draft as it was.

**Privacy**

- **FR-015**: Local drafts MUST stay in the data haex-mail keeps inside the vault and MUST NOT be sent anywhere before the person's own upload to their mail account (FR-007).

### Key Entities *(include if feature involves data)*

- **Draft**: An unsent mail that exists from the first typed character on. Has the account it is sent from, recipients, subject, text, attachments, the message it answers (if any), the time of its last change, and whether and where a copy lies on the server. Lives locally and may have exactly one copy in the drafts folder of its account.
- **Draft list**: The drafts of one account, or of all accounts in the unified view, newest first, local and server-only drafts together.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After an interruption without a clean close, at least 99% of mails with content are listed as drafts with all but the last second of their content when haex-mail starts again.
- **SC-002**: A mail link that arrives while a mail is being written changes nothing in that mail: in 100% of tries the earlier mail is a draft with its full text afterwards and the new mail shows only the link's fields.
- **SC-003**: Typing in the compose dialog shows no noticeable delay with saving on: typing a long text keeps up with a person typing quickly, and no save needs a connection.
- **SC-004**: A person finds and continues an earlier draft in at most two taps or clicks from the list of mail folders.
- **SC-005**: After a mail is sent or its draft deleted, 100% of tries leave no copy in the list or in the drafts folder of the server.
- **SC-006**: Writing without a connection shows no error to the person; the draft reaches the server folder within one minute of the account being reachable again.

## Assumptions

- Drafts live first in the data of haex-mail inside the vault, on this device; synchronising local drafts between devices is out of scope. The copy in the drafts folder of the server is how a draft reaches other programs on the same account.
- "Content" means any recipient, subject, text or attachment. A signature or quote that haex-mail inserts itself, such as the quoted original of a reply, does not count as content on its own, so a reply that was opened and never touched leaves no draft.
- Attachments stay with the draft as today: they are part of the saved draft, and the limits that apply to a draft today apply to the local draft, without a new limit.
- A draft that another program changed in the server's drafts folder after haex-mail uploaded it is detected when haex-mail uploads again; the newer server version is kept and the local one is kept as a second draft, so neither side overwrites the other without notice.
- Discarding stays in the dialog as a deliberate way to throw a draft away; it asks once for a mail with content (FR-013). The closing button keeps the draft, as it does today.
- Agent tools (`create_draft`, `send_mail` of spec 019) keep writing their drafts to the drafts folder of the server as they do today; those drafts appear in the list as server-only drafts and can be continued like any other.
- The compose dialog of spec 063 (haex-space/haex-vault@77a087a7cb8da94f8dca36fc7612d378e21b61a5:specs/063-mailto-extensions/spec.md, FR-015) opens a new draft for a mail link; this feature replaces the replacing behaviour that haex-space/haextension#165 documents as a simplification.
