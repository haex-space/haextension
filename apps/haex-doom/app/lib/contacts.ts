/** What haex-doom uses of `client.contacts` (the SDK's `ContactsAPI` fits it). */
export interface ContactsSource {
  listAsync(options?: { offset?: number; limit?: number }): Promise<{ contacts: { id: string; displayName: string }[]; total: number }>;
  readAsync(id: string): Promise<{ holziAddresses?: { devices: unknown[] } }>;
}

export interface InvitableContact {
  id: string;
  displayName: string;
}

const PAGE_SIZE = 100;
/** Contacts read at once; the host answers each read itself. */
const READ_BATCH = 8;

/**
 * The contacts the host can invite: those whose card lists at least one device. A contact that
 * cannot be read is left out, so one damaged entry does not hide the others.
 */
export async function listInvitableContacts(source: ContactsSource): Promise<InvitableContact[]> {
  const all: { id: string; displayName: string }[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await source.listAsync({ offset, limit: PAGE_SIZE });
    all.push(...page.contacts);
    if (page.contacts.length === 0 || all.length >= page.total) break;
  }

  const invitable: InvitableContact[] = [];
  for (let start = 0; start < all.length; start += READ_BATCH) {
    const batch = all.slice(start, start + READ_BATCH);
    const details = await Promise.all(batch.map((contact) => source.readAsync(contact.id).catch(() => null)));
    batch.forEach((contact, index) => {
      if ((details[index]?.holziAddresses?.devices.length ?? 0) > 0) {
        invitable.push({ id: contact.id, displayName: contact.displayName });
      }
    });
  }
  return invitable.sort((a, b) => a.displayName.localeCompare(b.displayName));
}
