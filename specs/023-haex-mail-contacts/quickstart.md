# Quickstart: checking contacts in haex-mail by hand

The pure modules and the store are covered by tests (see [contracts/mail-modules.md](contracts/mail-modules.md)). These scenarios check what a test over a fake cannot: the dialogs, the real host and its permission dialog. Each names the story, requirement or criterion it covers.

**Prerequisites**: a holzi build with the host part of this feature ([contracts/host-bridge.md](contracts/host-bridge.md)) and a haex-mail build against vault-sdk 5.6.0 (or a local link of it) installed in it; a test mail account with a few received mails; an address book with: "Erika Mustermann" (one e-mail address, a phone number and a note), "Max Muster" with two addresses, a contact with a name and a phone but no address, and one contact in a group "Arbeit". Do the scenarios in a fresh install so the permissions start in the state "ask".

## Run the checks

- haex-mail: `pnpm --filter haex-mail test` (Vitest).
- vault-sdk: its `pnpm test`.
- host: its Rust tests for `extensions` and its `check:extensions` script.

## Scenarios

1. **Suggestions with read only (US1, SC-002, FR-001 to FR-004)**: in the install dialog grant `read` and leave `readWrite` on ask. Open Compose, type "must" into To: Erika is offered with her address. Take her with Enter: `Erika Mustermann <…>, ` stands in the field. Type "max": Max is offered twice, once per address. Type the first letters of the contact without an address: not offered.
2. **The next recipient (US1 scenario 3)**: with "a@x.de, " in To, type "must": suggestions are for that part only; taking one leaves "a@x.de" untouched. Move the caret back into the first entry and type: suggestions follow the caret's entry.
3. **Keys and Cc/Bcc (US1 scenarios 4 and 5)**: ArrowDown/ArrowUp move, Tab takes, Escape closes without changing the field. Open Cc and Bcc: the same.
4. **A name with a comma (edge)**: give a contact the display name "Doe, John" and take it: the field holds `"Doe, John" <…>` and sending reads it back as one recipient.
5. **Typing is never held up (FR-005, SC-001)**: type quickly into To for ten seconds; no keystroke is delayed. With the address book seeded to 5,000 contacts, a suggestion appears within 0.3 s of stopping. **If it does not, fall back to the sweep of research R-8 before going on.**
6. **Read asked once (US4 scenario 7, FR-022)**: with `read` on ask, type into To for the first time: the host's dialog appears once, typing goes on; Allow: suggestions appear for the latest text. Repeat with Deny + remember: no suggestions, no second dialog while typing; the field still takes typed addresses. Close and reopen Compose after switching `read` on in the settings: suggestions work (FR-021).
7. **Save as a new contact, write granted (US2, SC-003)**: grant `readWrite`. Open a received mail from an unknown sender, open the menu at the sender, "Save to contacts" → "New contact": the form shows the mail's name and the address; confirm. The contact is in holzi's address book with that address, label `home`, no phone target, no group. Back in Compose, its name is suggested at once, without a restart (FR-006).
8. **No name (US2 scenario 2, Clarification)**: do the same for a mail without a display name: the name is empty; confirm without a name: the contact is created and holzi shows the address as its name. Do it again typing a name: that is stored.
9. **All fields by hand (US2, FR-008a, FR-008b)**: in the form fill given and family name, organization, job title, a note; add a second e-mail address, a phone (label "mobile"), a postal address, a messenger, a birthday without a year, a web site, a relation and a custom value named "Badge". Remove the prefilled e-mail row. Confirm: the contact in holzi shows exactly these. The form offers no photo, no groups, no phone targets.
10. **Nothing to identify (edge)**: remove every row and every name field: confirm explains what is missing and sends nothing.
11. **Already saved (US2 scenario 5, FR-009)**: open the menu for the address you just saved: it says the address is saved under that contact and does not offer "New contact" first.
12. **Add to an existing contact (US3, SC-004)**: for a mail from a new address of Erika: "Add to existing contact", search "erika", choose her: her current addresses are shown; "add": she now has both and her phone and note are unchanged.
13. **Replace (US3 scenario 3)**: do the same and choose "replace" on her old address: the contact has the new address in its place, the label kept, nothing else changed.
14. **The address is already there (US3 scenario 4)**: add an address the contact already holds, in another case: nothing is duplicated and you are told.
15. **Changed meanwhile (US3 scenario 5, FR-014)**: choose Erika in the dialog; in holzi change her note and add a phone; confirm in haex-mail: the address is added and the note and phone are kept.
16. **Deleted meanwhile (US3 scenario 6)**: choose Max, delete him in holzi, confirm: "no longer available", the choice of contact is open again, nothing was created.
17. **The value is gone (US3 scenario 7)**: choose "replace" on Max's old address, remove that address in holzi, confirm: nothing is changed, you are told why and the contact's current addresses are shown.
18. **Write on ask (US4, SC-005, SC-006)**: with `readWrite` on ask, confirm a save: the host's dialog opens at that moment, not before. Allow: the save completes once without retyping. Repeat and Deny without "remember": nothing saved, the form still holds your input, the buttons are still there and enabled (FR-018).
19. **Denied for good (US4 scenario 5, FR-020)**: Deny with "remember", confirm a save again: no dialog; a note says writing contacts is switched off, with a button; the button opens holzi's settings of haex-mail at the permissions; switch `readWrite` on there, confirm again in haex-mail without restarting: it saves (FR-021, SC-008).
20. **Limited to a group (edge)**: give `readWrite` only for the group "Arbeit" (declare it so, or change the target in the settings): a new contact lands in "Arbeit"; adding to a contact outside the group is refused with the note that writing is switched off or limited, and the contact is not changed.
21. **An older holzi (FR-028)**: against a holzi without the new calls, suggestions work; confirming a save says a newer holzi is needed and changes nothing; the buttons stay.
22. **Others are unaffected (SC-009)**: haex-doom's invitation list still reads contacts with its `read` permission and works as before.

Success criteria without a scenario of their own: SC-007 (nothing else of a contact changes) is covered by scenarios 12 to 15 and by the tests of `buildEmailChange`; SC-001's 0.3 s is scenario 5.
