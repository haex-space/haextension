import type { PeerEventMap, PeerEventType, PeerVisibility } from "@haex-space/vault-sdk";
import type { PeersApi } from "~/lib/peers";

/** Test double of the vault's peer channels: in-memory vaults that deliver to each other. */

class FakePeerError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

interface Lobby {
  id: string;
  code: string;
  visibility: PeerVisibility;
  owner: FakeVault;
  open: boolean;
  removed: Set<string>;
}

interface Channel {
  sides: [{ vault: FakeVault; id: string }, { vault: FakeVault; id: string }];
  open: boolean;
  lobby?: Lobby;
}

interface Invitation {
  inviteId: string;
  from: FakeVault;
  to: FakeVault;
  payload: unknown;
  done: boolean;
}

export interface SentMessage {
  from: string;
  to: string;
  reliable: boolean;
  data: Uint8Array;
}

type Handlers = { [T in PeerEventType]?: Set<(event: PeerEventMap[T]) => void> };

export class FakeVault {
  readonly api: PeersApi;
  /** Names of the vaults whose owners are this vault's contacts. */
  readonly contacts = new Set<string>();
  /** Accept invitations at once, before `inviteAsync` of the inviting side returns. */
  autoAccept = false;
  private readonly handlers: Handlers = {};

  constructor(
    readonly name: string,
    private readonly network: FakeNetwork,
  ) {
    this.api = {
      inviteAsync: (contactId, payload) => network.invite(this, contactId, payload),
      cancelInviteAsync: async (inviteId) => network.cancelInvite(inviteId),
      openLobbyAsync: async (lobbyId, visibility) => network.openLobby(this, lobbyId, visibility),
      closeLobbyAsync: async (lobbyId) => network.closeLobby(this, lobbyId),
      joinAsync: (code, displayName, payload) => network.join(this, code, displayName, payload),
      removeAsync: async (channelId) => network.remove(this, channelId),
      sendAsync: async (channelId, data, options) => network.send(this, channelId, data, options?.reliable ?? false),
      closeAsync: async (channelId) => network.close(channelId),
      on: (type, handler) => {
        const set = (this.handlers[type] ??= new Set()) as Set<typeof handler>;
        set.add(handler);
        return () => set.delete(handler);
      },
    };
  }

  contactId(of: FakeVault): string {
    return `contact:${of.name}`;
  }

  emit<T extends PeerEventType>(type: T, event: PeerEventMap[T]) {
    for (const handler of [...(this.handlers[type] ?? [])]) (handler as (event: PeerEventMap[T]) => void)(event);
  }
}

export class FakeNetwork {
  readonly vaults = new Map<string, FakeVault>();
  /** Every message sent over a channel, in order. */
  readonly sent: SentMessage[] = [];
  private readonly lobbies = new Map<string, Lobby>();
  private readonly channels = new Map<string, Channel>();
  private readonly invitations = new Map<string, Invitation>();
  private counter = 0;

  vault(name: string): FakeVault {
    const vault = new FakeVault(name, this);
    this.vaults.set(name, vault);
    return vault;
  }

  /** Makes each vault a contact of the other. */
  befriend(a: FakeVault, b: FakeVault) {
    a.contacts.add(b.name);
    b.contacts.add(a.name);
  }

  /** Lets queued deliveries run. */
  async settle() {
    for (let round = 0; round < 8; round++) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  private later(action: () => void) {
    void Promise.resolve().then(action);
  }

  private connect(a: FakeVault, b: FakeVault, lobby?: Lobby): Channel {
    const n = ++this.counter;
    const channel: Channel = { sides: [{ vault: a, id: `ch${n}-${a.name}` }, { vault: b, id: `ch${n}-${b.name}` }], open: true, lobby };
    for (const side of channel.sides) this.channels.set(side.id, channel);
    return channel;
  }

  private sideOf(channelId: string) {
    const channel = this.channels.get(channelId);
    if (!channel) throw new FakePeerError("channel_unknown");
    const index = channel.sides[0].id === channelId ? 0 : 1;
    return { channel, self: channel.sides[index]!, other: channel.sides[1 - index]! };
  }

  openLobby(owner: FakeVault, id: string, visibility: PeerVisibility) {
    if ([...this.lobbies.values()].some((lobby) => lobby.owner === owner && lobby.id === id && lobby.open)) throw new FakePeerError("invalid_input");
    const lobby: Lobby = { id, code: `code:${++this.counter}`, visibility, owner, open: true, removed: new Set() };
    this.lobbies.set(lobby.code, lobby);
    return { joinCode: lobby.code };
  }

  closeLobby(owner: FakeVault, id: string) {
    for (const lobby of this.lobbies.values()) if (lobby.owner === owner && lobby.id === id) lobby.open = false;
  }

  async join(joiner: FakeVault, code: string, displayName: string, payload: unknown) {
    const lobby = this.lobbies.get(code);
    if (!lobby || !lobby.open) throw new FakePeerError("lobby_closed");
    const isContact = lobby.owner.contacts.has(joiner.name);
    if (lobby.removed.has(joiner.name) || (lobby.visibility === "contacts" && !isContact)) throw new FakePeerError("not_admitted");
    const channel = this.connect(lobby.owner, joiner, lobby);
    this.later(() =>
      lobby.owner.emit("joined", {
        lobbyId: lobby.id,
        channelId: channel.sides[0].id,
        displayName,
        verified: isContact,
        contactId: isContact ? lobby.owner.contactId(joiner) : undefined,
        payload,
      }),
    );
    return { channelId: channel.sides[1].id, lobbyId: lobby.id };
  }

  async invite(from: FakeVault, contactId: string, payload: unknown) {
    const to = [...this.vaults.values()].find((vault) => from.contactId(vault) === contactId && from.contacts.has(vault.name));
    if (!to) throw new FakePeerError("contact_unknown");
    const invitation: Invitation = { inviteId: `invite${++this.counter}`, from, to, payload, done: false };
    this.invitations.set(invitation.inviteId, invitation);
    if (to.autoAccept) this.accept(invitation.inviteId);
    return { inviteId: invitation.inviteId };
  }

  cancelInvite(inviteId: string) {
    const invitation = this.invitations.get(inviteId);
    if (invitation) invitation.done = true;
  }

  /** The invited player accepts in the vault's prompt. */
  accept(inviteId: string) {
    const invitation = this.invitations.get(inviteId);
    if (!invitation || invitation.done) return;
    invitation.done = true;
    const channel = this.connect(invitation.from, invitation.to);
    invitation.from.emit("invite-status", { inviteId, status: "accepted", channelId: channel.sides[0].id });
    this.later(() =>
      invitation.to.emit("channel-opened", {
        channelId: channel.sides[1].id,
        origin: "invitation",
        inviteId,
        from: { contactId: invitation.to.contactId(invitation.from), name: invitation.from.name },
        payload: invitation.payload,
      }),
    );
  }

  /** The invited player declines, or the vault reports another outcome. */
  resolveInvite(inviteId: string, status: "declined" | "not-installed" | "unreachable" | "expired", hint?: "share_current_card") {
    const invitation = this.invitations.get(inviteId);
    if (!invitation || invitation.done) return;
    invitation.done = true;
    invitation.from.emit("invite-status", { inviteId, status, hint });
  }

  send(sender: FakeVault, channelId: string, data: Uint8Array, reliable: boolean) {
    const { channel, self, other } = this.sideOf(channelId);
    if (self.vault !== sender || !channel.open) throw new FakePeerError("channel_closed");
    if (!reliable && data.length > 1024) throw new FakePeerError("too_large");
    const copy = data.slice();
    this.sent.push({ from: sender.name, to: other.vault.name, reliable, data: copy });
    this.later(() => {
      if (channel.open) other.vault.emit("message", { channelId: other.id, data: copy, reliable });
    });
  }

  close(channelId: string, reason: "closed" | "lost" | "timeout" = "closed") {
    const { channel } = this.sideOf(channelId);
    if (!channel.open) return;
    channel.open = false;
    this.later(() => {
      for (const side of channel.sides) side.vault.emit("channel-closed", { channelId: side.id, reason });
    });
  }

  remove(owner: FakeVault, channelId: string) {
    const { channel, self, other } = this.sideOf(channelId);
    if (self.vault !== owner || !channel.lobby) throw new FakePeerError("channel_unknown");
    channel.lobby.removed.add(other.vault.name);
    this.close(channelId);
  }

  /** Connection loss: both sides learn the channel is gone. */
  drop(channelId: string, reason: "lost" | "timeout" = "lost") {
    this.close(channelId, reason);
  }
}
