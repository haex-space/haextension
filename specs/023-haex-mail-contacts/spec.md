# Feature Specification: haex-mail — contacts from the address book

**Feature Branch**: `023-haex-mail-contacts`

**Created**: 2026-11-12

**Status**: Draft

**Input**: User description: "haex-mail: use the contacts of holzi. (1) Suggestions while writing: in the recipient fields of a new mail the person always gets suggestions from the contacts of the address book (matching name, organization, e-mail address; read access is enough). (2) From a received mail the person can save an address either as a completely new contact, or add it to an existing contact or update that contact's entry. (3) Permissions: reading and writing are separate. Without write access the suggestions keep working; the actions that create or change contacts are not disabled but bring up the host's permission dialog when the write permission is not given, and carry on once it is granted. A decision once made can be changed later (first read only, write access later once the person sees what it is for), in the permission settings of the extension in holzi and by the dialog at the click. Prerequisites in the dependencies, recorded as requirements: holzi gets a write permission for contacts and the operations to create and change a contact (a new contact with phone targets stays the person's own decision; the group scope of the permission is kept when a contact is created); the vault-sdk gets the matching create and change calls with types, tests and documentation (minor release). Today an extension can only read and search contacts; it cannot change them."

## Clarifications

### Session 2026-11-12

- Q: Are "groups" the same thing as tags? → A: Yes, they are the groups of the address book in holzi (the permission model of the host calls them tags internally). A permission can be limited to one group. For mail this matters only at the edges (see Edge Cases); the feature does not create, rename or assign groups.
- Q: If a contact changes in holzi between the person choosing it and confirming, does the address still get written? → A: Yes, onto the current state of the contact. The change names only single e-mail values, so it needs no check of a version. It fails only when the contact is gone or, for "replace", when the value to replace is no longer there.
- Q: What does haex-mail do on a holzi that does not know the new create and change operations yet? → A: Suggestions keep working unchanged (they use only the existing read access). The save actions stay visible and clickable; on confirming, haex-mail says plainly that a newer holzi is needed and changes nothing.
- Q: Which display name does a new contact get when the mail gave none and the person types none? → A: None. The name stays empty and holzi shows the address in its place (the address book already derives its shown name that way); haex-mail invents no name.
- Q: When does haex-mail ask for read access that is still in the state "ask"? → A: At the first typing in a recipient field, when the suggestions are needed; not when the compose dialog opens, and not again while that question is open.
- Direction 2026-11-12 (from the person, on Story 2): the form for a new contact lets the person maintain all the other fields by hand, not only name and address; with no name in the mail, the person simply types one. Photo and phone targets stay the person's own decisions in holzi, as does everything that comes from a contact card (the holzi addresses); groups are not offered. The form for adding to an existing contact stays limited to e-mail addresses.
- Context 2026-11-12: holzi's own code already lets the person's window and the agent create and change contacts, and a change can touch single values (a patch adds or replaces one e-mail address without rewriting the contact). What an extension lacks is the permission and the host operations. So this feature has a part in the host and the SDK (see Dependencies), not only in haex-mail.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Suggestions for recipients from my contacts (Priority: P1)

A person writes a new mail. They type a few letters of a name, an organization or an e-mail address into To, Cc or Bcc, and haex-mail offers the matching contacts of the address book. Choosing one puts the address into the field, with the contact's name, and the person carries on typing the next recipient.

**Why this priority**: This is the everyday gain. It needs read access only, works without any change to contacts, and is useful on its own as soon as the host can be read.

**Independent Test**: With a few contacts in holzi's address book, open the compose dialog, type the first letters of a contact's name into To: the contact is offered; choose it: its address is in the field and the mail can be sent to it.

**Acceptance Scenarios**:

1. **Given** the address book has a contact "Erika Mustermann" with an e-mail address, **When** the person types "must" into To, **Then** the contact is offered with its name and address, matching regardless of case and accents.
2. **Given** a contact has two e-mail addresses, **When** it matches, **Then** both addresses are offered as separate entries, so the person chooses the one they mean.
3. **Given** the person has already entered "a@x.de, " in a field, **When** they type the start of another name after the comma, **Then** suggestions are offered for that part only and the first address stays untouched.
4. **Given** suggestions are shown, **When** the person uses the arrow keys and Enter (or Tab), **Then** the highlighted suggestion is taken; Escape closes the list without changing the field.
5. **Given** the same applies to Cc and Bcc, **When** the person types there, **Then** they get the same suggestions.
6. **Given** a contact has no e-mail address, **When** it matches by name, **Then** it is not offered, because there is nothing to put into the field.
7. **Given** nothing matches, **When** the person types, **Then** no list appears and typing is neither slowed nor interrupted; an address that was typed out in full is accepted exactly as today.

---

### User Story 2 - Save an address from a received mail as a new contact (Priority: P1)

A person reads a mail from someone they do not have in the address book. At the sender (or any address in From, To or Cc) they choose "Save to contacts" and "New contact". The form is filled in with the name the mail gave and the address. The person may fix the name, give a name the mail did not have, and fill in any other detail of the contact by hand (name parts, organization, job title, note, further phone numbers, addresses, web sites and other values), or leave them all empty, and confirms. The contact now exists in the address book.

**Why this priority**: This is the second half of the request and the one that needs the new host operation. It is the shortest path to an address book that grows with the mail.

**Independent Test**: With write access granted, open a received mail from an unknown address, choose "Save to contacts" → "New contact" and confirm: the contact appears in holzi's address book with that address, and typing its name in the compose dialog now suggests it.

**Acceptance Scenarios**:

1. **Given** a received mail from "Max Muster <max@x.de>" and no such contact, **When** the person chooses "New contact", **Then** the form shows the name "Max Muster" and the address, both editable, and the contact is created only on confirmation.
2. **Given** the mail gave no display name, **When** the form opens, **Then** the name is empty, the person MAY enter one, and may confirm without; the contact is then created with the address only and holzi shows the address as its name.
3. **Given** the person filled in only name and address, **When** the contact was created, **Then** the contact is in holzi's address book with the address as an e-mail value, and nothing else was added (no phone targets, no groups).
   - **Given** the person also filled in other fields (given and family name, organization, job title, note, a phone number, a postal address, a web site, a custom value), **Then** the contact holds exactly those, each with the label the person gave.
   - **Given** the person adds a second e-mail address or removes the prefilled one in the form, **Then** the contact is created with exactly the addresses left in the form; a contact without any name, address, phone number or organization is not created and the person is told why.
4. **Given** the contact was created, **When** the person types its name into a recipient field, **Then** it is suggested at once, without restarting haex-mail.
5. **Given** the address already belongs to a contact, **When** the person opens "Save to contacts", **Then** they are told that the address is already saved under that contact, and "New contact" is not the offered default (see Story 3 for adding to another one).
6. **Given** the person cancels the form, **Then** nothing is created.

---

### User Story 3 - Add an address to an existing contact, or update it (Priority: P2)

A person gets a mail from someone they know, but from a new address. At that address they choose "Save to contacts" → "Add to existing contact", search the contact by name, and choose it. They decide whether the address is added next to the contact's other e-mail addresses or replaces one of them (the old one is shown). They confirm; the contact now carries the address.

**Why this priority**: Equally part of the request, but it builds on Story 2 (same permission, same save path) and adds the search of a contact and the choice between adding and replacing.

**Independent Test**: With write access granted and a contact "Erika Mustermann" holding one address, open a received mail from a different address, choose "Add to existing contact", pick Erika, choose "add": her contact now lists both addresses.

**Acceptance Scenarios**:

1. **Given** the person chose "Add to existing contact", **When** they type letters of a name, **Then** the contacts matching by name, organization, phone number or address are listed, and choosing one shows its current e-mail addresses.
2. **Given** a contact with one address "alt@x.de", **When** the person chooses "add", **Then** the contact has both addresses afterwards and its other details (name, phones, note, photo, groups) are unchanged.
3. **Given** the same contact, **When** the person chooses "replace alt@x.de", **Then** the contact has the new address instead of the old one and nothing else changed.
4. **Given** the contact already has exactly this address (in any case), **When** the person confirms, **Then** nothing is duplicated; they are told it is already there.
5. **Given** the contact was changed in holzi (a note, a phone, another address) while the form was open, **When** the person confirms, **Then** the address is added to or replaced in the contact as it is now, and those other changes are kept.
6. **Given** the contact was deleted in holzi while the form was open, **When** the person confirms, **Then** they get a clear message and nothing is created in its place.
7. **Given** the person chose "replace alt@x.de" and that address is no longer on the contact, **When** they confirm, **Then** nothing is changed, they are told why, and they can choose again with the contact's current addresses shown.
8. **Given** the person cancels, **Then** the contact stays as it was.

---

### User Story 4 - Write access can be asked for later, and changed later (Priority: P2)

A person first lets haex-mail only read their contacts, because they only want suggestions. Later they see "Save to contacts" in a mail and try it. The action is there and clickable all along; the click brings up the host's permission dialog for writing contacts. They grant it, and the action they started carries on without being started again. Another person declines for good: the suggestions keep working, the action stays visible, and when they use it again haex-mail tells them that writing contacts is switched off and takes them to the extension's settings in holzi, where they can switch it on, or revoke it again, at any time.

**Why this priority**: It shapes how Stories 2 and 3 behave and is what makes read-only use a respectable state, not a dead end. It depends on the host (Dependencies), hence P2.

**Independent Test**: Grant haex-mail read access only. Open a received mail, choose "Save to contacts": the host's dialog asks for permission to change contacts. Decline: nothing is created, suggestions still work, the button is still there. Click again, grant: the form carries on and the contact is created.

**Acceptance Scenarios**:

1. **Given** only read access is granted, **When** the person opens the save actions, **Then** all of them are visible and enabled; none is greyed out or hidden.
2. **Given** write access is not granted, **When** the person confirms a save, **Then** the host's permission dialog opens at that moment (not before the person acts), and haex-mail waits for the answer.
3. **Given** the person grants it, **When** the dialog closes, **Then** the save runs once, without the person re-entering anything, and they see the usual confirmation.
4. **Given** the person declines, **When** the dialog closes, **Then** nothing is saved, the form stays open with what the person entered, and a short note says that saving needs the permission.
5. **Given** the person has explicitly set write access to "denied" (in the dialog or in the settings), **When** they confirm a save, **Then** the host does not ask again, nothing is saved, and haex-mail shows a note that writing contacts is switched off, with a button that opens the permission settings of haex-mail in holzi, where the person can change it; the form stays open with its input.
6. **Given** the person changes the permission in the extension's settings in holzi (read only → also write, or write → read only), **When** they next use a save action, **Then** the change is in effect without restarting haex-mail.
7. **Given** read access is not granted either, **When** the person types in a recipient field, **Then** the host's dialog for reading contacts is shown at the first typing in a recipient field, at most once for that question; if declined, the field works exactly as before, without suggestions, and typing is never blocked or nagged on every key.
8. **Given** the permission is revoked while the compose dialog or a save form is open, **When** the next contact call fails, **Then** the dialog is asked as in 2; nothing breaks.

---

### Edge Cases

- **Address book is empty or large.** With no contacts, nothing is suggested and nothing looks broken. With thousands of contacts, suggestions still appear promptly and only the best matches (a short list) are shown.
- **Several mails/addresses.** "Save to contacts" is offered per address (From, To, Cc), not once per mail, so the person can save the right person of a mail with several recipients. The person's own addresses (the accounts of haex-mail) are not offered.
- **Names with commas or quotes** ("Doe, John") are inserted so that the recipient field still reads back as one address.
- **Write access limited to a group.** If the permission covers only one group of the address book, a new contact created by haex-mail lands in that group, and contacts outside the group are neither suggested for changing nor changeable; the person is told that haex-mail may only change contacts of that group.
- **Read access limited to a group.** Suggestions come only from that group; this is not an error.
- **Contacts the host cannot change** (for example a value of a kind this version does not know) are never changed in that value; the address is added next to them.
- **A holzi without the new operations.** Suggestions work as with any holzi that can read contacts. A save that the host does not know answers, on confirming, that a newer holzi is needed; the form stays open, nothing is changed, and the action is neither hidden nor greyed out.
- **Host unavailable or the call fails.** The compose dialog keeps working as today; a failed save names the reason in plain words and keeps the form open.
- **Two addresses that differ only in case** are one address.
- **An address that is not valid** (not a plain address) is not offered for saving.
- **Phone targets and groups.** haex-mail never sends a contact to a phone and never assigns groups; those stay the person's own decisions in holzi.

## Requirements *(mandatory)*

### Functional Requirements

**Suggestions (haex-mail)**

- **FR-001**: While the person types in To, Cc or Bcc, haex-mail MUST offer the contacts of the address book whose name, organization or e-mail address contains what was typed, ignoring case and accents, as a list the person can choose from by mouse, touch or keyboard.
- **FR-002**: Each e-mail address of a matching contact MUST be a separate suggestion showing the contact's name and that address; a contact without an e-mail address MUST NOT be offered.
- **FR-003**: Suggestions MUST apply to the address being typed (the part after the last separator) and MUST leave addresses already in the field unchanged; choosing one MUST insert it in a form the field's reader accepts, including for names that contain commas or quotes.
- **FR-004**: Suggestions MUST work with read access to contacts alone.
- **FR-005**: Typing MUST NOT be delayed or blocked by looking up contacts; a slow or failed lookup MUST leave the field working as today, and an address typed out in full MUST always be accepted.
- **FR-006**: A new contact saved from a mail (FR-010 to FR-016) MUST be suggested without restarting haex-mail.

**Saving from a mail (haex-mail)**

- **FR-007**: For each address in From, To and Cc of a received mail, haex-mail MUST offer "Save to contacts" with two choices: "New contact" and "Add to existing contact". The addresses of the person's own accounts MUST NOT be offered.
- **FR-008**: "New contact" MUST open a form prefilled with the display name the mail gave (if any) and the address; the contact MUST be created only on confirmation. The person MUST be able to edit the name, or type one when the mail gave none; without a name the contact MUST be created with the address only, and haex-mail MUST NOT derive or invent a name from the address.
- **FR-008a**: The same form MUST let the person maintain, by hand, display name, given, middle and family name, prefix, suffix, nickname, organization, job title and note, and any number of values of the kinds phone number, e-mail address, postal address, web site, instant-messaging address, SIP address, event, relation and custom value, each with a label chosen from the labels the address book offers for that kind (for example home, work, mobile, other) or an own name; every field is optional except that the contact needs at least one of a name, an organization, a phone number or an e-mail address (as in holzi itself).
- **FR-008b**: The form MUST NOT offer photo, phone targets, groups or the holzi addresses of a contact card; those stay the person's own decisions in holzi. The form for adding to an existing contact (FR-010, FR-011) MUST stay limited to e-mail addresses.
- **FR-009**: Before offering "New contact", haex-mail MUST look up the address; if a contact already holds it, the person MUST be told so and shown that contact.
- **FR-010**: "Add to existing contact" MUST let the person search the address book by name, organization, phone number or address, and choose one contact; the contact's current e-mail addresses MUST be shown.
- **FR-011**: For the chosen contact the person MUST be able to choose between adding the address and replacing one of its existing e-mail addresses.
- **FR-012**: Adding or replacing MUST change only the e-mail values named; every other detail of the contact (name, phones, other values, note, photo, groups, phone targets) MUST be left as it is.
- **FR-013**: An address that the contact already holds (ignoring case) MUST NOT be added a second time; the person MUST be told.
- **FR-014**: The address MUST be added or replaced on the current state of the contact, whatever else changed on it since the person chose it. If the contact no longer exists, or the address to replace is no longer on it, the action MUST fail with a plain message, change nothing and MUST NOT create a contact in its place.
- **FR-015**: haex-mail MUST NOT assign groups or phone targets to a contact it creates or changes, and MUST NOT set its photo.
- **FR-016**: After a successful save the person MUST see a confirmation naming the contact.

**Permissions (haex-mail, using the host)**

- **FR-017**: haex-mail MUST declare reading contacts and writing contacts as two separate permissions, so the person can grant the first without the second.
- **FR-018**: The save actions MUST be visible and enabled whether or not write access is granted; they MUST NOT be hidden or greyed out.
- **FR-019**: When a save is confirmed without write access, haex-mail MUST surface the host's permission dialog at that moment, wait for the answer, and on a grant run the save once without the person re-entering anything; on a refusal it MUST change nothing, keep the form open with its input, and say that saving needs the permission.
- **FR-020**: When write access is explicitly denied, a save MUST NOT ask again and MUST NOT change anything; haex-mail MUST show that writing contacts is switched off and offer a button that opens the permission settings of haex-mail in holzi (FR-029); the form MUST stay open with the person's input.
- **FR-021**: A change of either permission made by the person in holzi MUST take effect on the next action without restarting haex-mail.
- **FR-022**: Missing read access MUST never prevent writing a mail; haex-mail MUST ask for it when the person first types in a recipient field (not when the compose dialog opens), no more than once per open question, and MUST NOT nag while typing.

**Dependencies (host and SDK, requirements for this feature to work)**

- **FR-023**: The host (holzi) MUST offer an extension a write permission for contacts that is separate from the read permission, covers reading, can be given for all contacts or for one group, and has the same three states (granted, ask, denied) that can be changed by the person at any time in the extension's permission settings.
- **FR-024**: The host MUST let an extension holding that permission create a contact with the head fields and value kinds of FR-008a and change a contact (a partial change that adds, replaces or removes single values and leaves everything not named untouched, applied to the contact as it is when the call arrives, with no check of a version the caller read earlier; a value to replace or remove that no longer exists MUST be reported, not ignored). Both MUST use the same checks and the same limits as the host's own functions.
- **FR-025**: The host MUST keep the person in charge of what stays theirs: a contact created or changed by an extension MUST NOT be sent to any phone by the extension; an extension MUST NOT create a contact outside the group scope of its permission; a contact outside the scope MUST answer exactly like a missing one.
- **FR-026**: A call that lacks the permission MUST answer so that the host puts its permission question before the person, like the host's other permissions do, naming the write action.
- **FR-027**: The vault-sdk MUST offer calls to create a contact and to change a contact, with typed input and result, tests for both, and documentation of the permission; it MUST be released as a minor version, and haex-mail MUST use that version.
- **FR-028**: The existing read calls and read permission MUST keep working for every extension unchanged, and haex-mail's suggestions MUST work on a holzi that has only the read calls. On a holzi that does not know the create, change or settings calls (FR-024, FR-029), haex-mail MUST tell the person on confirming that a newer holzi is needed, and MUST change nothing.
- **FR-029**: The host MUST let an extension ask it to open that extension's own permission settings in holzi (never those of another extension, and only as a request the person sees happen), and the vault-sdk MUST offer this as a call, documented and tested. Without it, a person who denied write access has no way from haex-mail to the place where they can undo that.

**Interface text**

- **FR-030**: All text of the new interface MUST exist in German and English, the languages of haex-mail.

### Key Entities *(include if feature involves data)*

- **Contact**: a person or organization in holzi's address book, owned by the host. Has a display name, optional name parts, organization, note, photo, groups, and any number of values (e-mail addresses, phone numbers, other kinds). haex-mail reads it and, with write access, creates one with the fields the person fills in (FR-008a) or adds or replaces e-mail values of an existing one.
- **E-mail value**: one address of a contact, with a label. The unit that haex-mail adds or replaces.
- **Mail address (of a message)**: an address with an optional display name, as it appears in From, To or Cc of a received mail. The source of "Save to contacts".
- **Suggestion**: one pair of a contact's name and one of its e-mail addresses, offered while the person types a recipient.
- **Contacts permission**: the person's decision, per extension, whether haex-mail may read contacts and whether it may also change them, for all contacts or one group, in the state granted, ask or denied.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With an address book of 5,000 contacts, suggestions appear within 0.3 seconds of the last key typed, and typing in the field stays as smooth as without the feature.
- **SC-002**: A person can address a mail to a known contact by typing at most 3 letters and choosing a suggestion, in at most 2 interactions after typing.
- **SC-003**: A person can save the sender of a received mail as a new contact in at most 3 interactions after opening the mail (open the action, confirm the prefilled form, done), when write access is already granted and no further field is filled in.
- **SC-004**: A person can add an address to an existing contact in at most 5 interactions, including finding the contact.
- **SC-005**: With read-only access, 100% of save attempts end in either the permission dialog or a saved contact; none fails silently and none shows a disabled control.
- **SC-006**: After a grant in the dialog, the save the person started completes without re-entering data in 100% of cases.
- **SC-007**: Saving never alters a detail of a contact that the action did not name; checked across contacts with every kind of value, in 100% of the test cases.
- **SC-008**: A person who has granted read access only, and later grants write access, needs no more than one dialog and no restart to use the save actions.
- **SC-009**: Extensions that only read contacts (for example haex-doom's invitations) work unchanged after the host and SDK changes.

## Assumptions

- The address book is holzi's; haex-mail reaches it only through the host and the SDK, never by a store of its own. Mail addresses are not collected into contacts automatically; the person always chooses.
- A contact is saved with the display name from the mail as its display name; splitting it into given and family name is left to the person, who can do it in the form or later in holzi.
- A new e-mail value gets the label "home", the one holzi's own window offers first for e-mail; the person can change it in the form or later in holzi.
- "Replace" means replacing the value of one existing e-mail address; removing an address without a replacement is not part of this feature.
- Suggestions are limited to a short list (about ten) of the best matches, sorted so that names starting with what was typed come first.
- The extension's permission settings in holzi already let the person switch a permission between granted, ask and denied (they do for other permissions); new are the write permission, its use, and the way for an extension to bring the person to that page (FR-029).
- The host's rule that an explicitly denied permission is never asked again stays as it is; this feature works with it, not against it.
- The feature is built in three parts that ship in this order: the host (holzi), the SDK (vault-sdk), haex-mail. The host part is specified and planned in holzi's own spec numbering, with an ADR that supersedes its earlier decision that extensions only read contacts; this spec holds the requirements it must meet (FR-023 to FR-029) so that haex-mail can be tested against them.
- Not in scope: editing any detail other than e-mail addresses of an existing contact from haex-mail, deleting contacts, photos, groups, phone targets, the holzi addresses of a contact card, importing contacts from mail servers, collecting addresses automatically, showing contact photos in the mail list, and showing which received mails belong to a contact.
