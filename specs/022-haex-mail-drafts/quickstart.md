# Quickstart: checking the drafts by hand

The pure modules and the store are covered by tests; these scenarios check what a test over an in-memory backend cannot: the dialog, the real IMAP server and the host. Each names the success criterion and requirement it covers. Use a test account on a server with UIDPLUS, and a second mail program (or webmail) on the same account.

Prerequisite: haex-space/haextension#165 is merged and haex-mail is installed in a holzi build with the opener (spec 063).

1. **Nothing typed is lost (US1, SC-001, FR-001)**: open the compose dialog, type a recipient, a subject and three paragraphs, wait two seconds, then kill the haex-mail frame (close the tab from the task list without the dialog's close button, or end the app). Open haex-mail again: the drafts view lists the mail with its subject and the time of the last change; opening it shows all text.
2. **No draft without content (FR-002)**: open the dialog and close it without typing: the drafts view has no new entry. Type a word, delete it, close: still none.
3. **An untouched reply leaves nothing (Assumptions)**: open Reply on a mail and close the dialog at once: no draft. Open Reply, type one word, close: a draft that is a reply (subject `Re: …`, quoted text).
4. **A link never replaces my mail (US2, SC-002, FR-005)**: write two paragraphs; hand haex-mail a mail link through the opener (the mail button of a contact, spec 063). The dialog shows the link's fields; close it: the drafts view lists the link's draft **and** the earlier one with both paragraphs. Do the same with the compose button instead of a link.
5. **Continue a draft (US3, SC-004, FR-011)**: open one of the two drafts from the list: the dialog shows its content; change a word, close; the list still has two drafts, not three.
6. **Several accounts (US3 scenario 3)**: with two accounts, start a mail in each; the unified drafts view lists both and each keeps its "From".
7. **The server copy (US4, FR-007, FR-008)**: write a draft and close the dialog: within a minute the other program shows exactly one draft in its drafts folder. Reopen the draft, change the subject, wait 40 seconds without closing: the other program shows one draft with the new subject, not two.
8. **Offline (US4, SC-006, FR-009)**: turn the network off, write a draft, close: no error appears. Turn it on: within a minute the other program shows the draft.
9. **Delete and send (US5, SC-005, FR-012, FR-014)**: delete a draft that is up: gone from the list and from the other program's folder. Send another draft that is up: the same.
10. **Discard asks (FR-013)**: type text, press "Discard": a question appears; "No" keeps the dialog and the draft, "Yes" deletes the draft. Closing with the close button never asks.
11. **A draft of another program (Assumptions)**: create a draft in the other program, open the drafts view in haex-mail: it appears as a server-only draft; open it, change it, close: after the next upload the other program shows one draft (the replaced one), not two.
12. **Search by Message-ID (research R-4, T001)**: the first task of the implementation is a probe against a real account: append a message with a self-chosen Message-ID, search for it, check the envelope, delete it by UID. If this fails the fallback header of the research is used.

Success criteria not covered by a scenario: SC-003 (typing without delay) is checked in scenario 1 by typing quickly for a minute in a long mail; the unit test of the saver covers the one-write-per-pause rule.
