# Contract: vault-sdk — what haex-mail uses

The changes of `haex-space/vault-sdk` for FR-027, FR-029 and FR-028, checked against 1af55e9d95858db14603b984394e1235c145de93 (5.5.0). They ship as one minor release (5.6.0) from a `feat(contacts): …` commit. The calls are thin: they send the host's methods of [host-bridge.md](host-bridge.md) through `client.request`, so the prompt-and-retry, the error shape and the type guards (`isPermissionDeniedError`, `isPermissionPromptError`) are the client's own and are not changed.

## Commands (`src/commands/contacts.ts`, `src/commands/permissions.ts`)

```ts
CONTACT_COMMANDS.create = "extension_contacts_create"
CONTACT_COMMANDS.update = "extension_contacts_update"
PERMISSIONS_COMMANDS.openSettings = "extension_permissions_open_settings"
```

## Types (`src/types/contacts.ts`)

```ts
/** The kinds an extension may write; the host refuses the others. */
export type ContactValueKind =
  | "phone" | "email" | "address" | "website" | "im" | "sip"
  | "event" | "relation" | "custom";

/** One value to write. `value` of an address, a messenger and an event is a JSON object as text. */
export interface ContactValueInput {
  kind: ContactValueKind;
  label: string;          // a label of the kind, or "custom:<text>"
  value: string;
}

export interface ContactHeadInput {
  displayName?: string; givenName?: string; middleName?: string; familyName?: string;
  namePrefix?: string; nameSuffix?: string; nickname?: string;
  organization?: string; jobTitle?: string; note?: string;
}

/** A new contact. It has no groups, phone targets or photo; those are the person's to set. */
export interface ContactCreateInput {
  head?: ContactHeadInput;
  values?: ContactValueInput[];
}

/** A change to the values of a contact; what is not named stays as it is. */
export interface ContactValuesChange {
  /** `label` may be left out when `id` names an existing value: its current label is kept. */
  upsert?: Array<Omit<ContactValueInput, "label"> & { label?: string; id?: string; position?: number }>;
  remove?: string[];
}
```

`ContactDetail` (existing) is the result of both calls. The manifest type gains the action: `contacts?: { target: string; action?: "read" | "readWrite" }[]` (`src/types.ts`).

## API

```ts
class ContactsAPI {
  /** Creates a contact. Needs `contacts` + `readWrite`; the host asks the person if it is not
   *  granted and the SDK waits (as for every permission) and repeats the call on a grant. */
  createAsync(input: ContactCreateInput): Promise<ContactDetail>;

  /** Changes the values of a contact on its current state. Rejects with the host's
   *  `Validation` error and `details.reason = "value_not_found"` when a value to change no longer
   *  exists; with 1002 when the permission is off or the contact is not reachable. */
  updateAsync(id: string, values: ContactValuesChange): Promise<ContactDetail>;
}

class PermissionsAPI {
  /** Opens the host's page of this extension's permissions. Only its own, never another's. */
  openSettingsAsync(): Promise<void>;
}
```

The class comment of `ContactsAPI` ("Extensions cannot change contacts") is rewritten to say that writing needs `readWrite` and what a refusal looks like.

## Tests (beside `src/api/__tests__/contacts.test.ts` and `permissions` tests)

- `createAsync` sends `extension_contacts_create` with exactly `{ head, values }` and returns the answer; `head` and `values` may be absent.
- `updateAsync` sends `{ id, values }` and returns the answer; `upsert` with and without `id`, and `remove`.
- A rejected request (a host error object) reaches the caller unchanged.
- `openSettingsAsync` sends `extension_permissions_open_settings` with `{}`.
- The prompt-and-retry for a 1004 naming `readWrite` is covered by the client's existing retry tests; one case is added with `action: "readWrite"` to pin the key.

## Documentation (`README.md`)

A section "Contacts" covering: the permission rows (`read`, `readWrite`) and what each allows; the three read calls and the two write calls with a short example; what a refusal looks like and that a missing contact answers like a hidden one; that groups, phone targets and photos are not reachable; `PermissionsAPI.openSettingsAsync` for a person who denied. The existing "Extensions can only read" wording is removed.
