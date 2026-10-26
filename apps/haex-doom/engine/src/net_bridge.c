// Network module of haex-doom: replaces Chocolate/Crispy DOOM's SDL2_net module
// (`net_sdl_module`) with datagrams over the vault's peer channels. The shell owns the
// channels and the queue of incoming datagrams (contracts/engine-bridge.md); this file is the
// engine's end of it.

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "doomtype.h"
#include "i_system.h"
#include "m_misc.h"
#include "net_client.h"
#include "net_defs.h"
#include "net_io.h"
#include "net_packet.h"
#include "net_sdl.h"
#include "net_server.h"

#include "haex_imports.h"
#include "net_bridge.h"

// The vault's limit for fast (unreliable) messages. DOOM's packets stay far below it.
#define MAX_DATAGRAM 1024
// Header the shell puts in front of every received datagram: the sender's peer number, little endian.
#define PEER_PREFIX 4
// The largest datagram the shell hands out.
#define RECV_BUFFER (PEER_PREFIX + MAX_DATAGRAM)

// One address per peer number. `addr` is the first member, so a net_addr_t* of this module
// is also a peer_addr_t*.
typedef struct
{
    net_addr_t addr;
    int peer;
    // The channel closed; the server or client learns about it on the next poll.
    boolean closed;
} peer_addr_t;

// ponytail: a linear table is plenty for the 2 to 4 players of a game (the vault allows 16
// channels per extension). Upgrade path: a hash map keyed by peer number.
static peer_addr_t **peer_table = NULL;
static int peer_table_size = 0;

static boolean closed_pending = false;

static peer_addr_t *FindPeer(int peer)
{
    int i;

    for (i = 0; i < peer_table_size; ++i)
    {
        if (peer_table[i] != NULL && peer_table[i]->peer == peer)
        {
            return peer_table[i];
        }
    }

    return NULL;
}

// The address of a peer: the same net_addr_t for every packet from or to that peer for as
// long as it is referenced, because the server finds its clients by comparing pointers.
static net_addr_t *AddressOf(int peer)
{
    peer_addr_t *entry = FindPeer(peer);
    int i;

    if (entry != NULL)
    {
        return &entry->addr;
    }

    entry = calloc(1, sizeof(peer_addr_t));
    if (entry == NULL)
    {
        I_Error("NET_Bridge: out of memory");
    }
    entry->peer = peer;
    entry->addr.refcount = 0;
    entry->addr.handle = entry;
    entry->addr.module = &net_sdl_module;

    for (i = 0; i < peer_table_size; ++i)
    {
        if (peer_table[i] == NULL)
        {
            peer_table[i] = entry;
            return &entry->addr;
        }
    }

    peer_table_size = peer_table_size == 0 ? 8 : peer_table_size * 2;
    peer_table = realloc(peer_table, sizeof(peer_addr_t *) * peer_table_size);
    if (peer_table == NULL)
    {
        I_Error("NET_Bridge: out of memory");
    }
    // The first new slot is `i`, the old size.
    memset(&peer_table[i], 0, sizeof(peer_addr_t *) * (peer_table_size - i));
    peer_table[i] = entry;

    return &entry->addr;
}

static boolean NET_Bridge_InitClient(void)
{
    return haex_net_active() != 0;
}

static boolean NET_Bridge_InitServer(void)
{
    return haex_net_active() != 0;
}

static void NET_Bridge_SendPacket(net_addr_t *addr, net_packet_t *packet)
{
    // The peer channels have no broadcast, and the LAN search that uses it is not reachable.
    if (addr == &net_broadcast_addr || addr->module != &net_sdl_module)
    {
        return;
    }

    if (packet->len > MAX_DATAGRAM)
    {
        fprintf(stderr, "NET_Bridge: dropped a packet of %u bytes (limit %d)\n",
                (unsigned int) packet->len, MAX_DATAGRAM);
        return;
    }

    // ponytail: every datagram is one call into JavaScript (and one copy out of the heap), and
    // RecvPacket one call per datagram in. DOOM sends one small packet per player per tic (35 a
    // second), which this carries. Upgrade path if the round trip measured with four players
    // (T054, SC-009/SC-010) is too slow: queue the datagrams here and flush them once per
    // animation frame (a batched haex_net_send), and have the shell hand the whole receive queue
    // over per frame.
    haex_net_send(((peer_addr_t *) addr)->peer, packet->data, (int) packet->len);
}

// Tells the server and the client about channels that closed since the last poll. Both treat
// the peer as if it had timed out, without waiting for the 30 seconds of silence.
static void ApplyClosedPeers(void)
{
    int i;

    closed_pending = false;

    for (i = 0; i < peer_table_size; ++i)
    {
        peer_addr_t *entry = peer_table[i];

        if (entry != NULL && entry->closed)
        {
            entry->closed = false;
            // The calls can release the address and with it free the entry; it is not used afterwards.
            NET_SV_PeerClosed(&entry->addr);
            NET_CL_PeerClosed(&entry->addr);
        }
    }
}

static boolean NET_Bridge_RecvPacket(net_addr_t **addr, net_packet_t **packet)
{
    static uint8_t buffer[RECV_BUFFER];
    int len, peer;

    if (closed_pending)
    {
        ApplyClosedPeers();
    }

    len = haex_net_recv(buffer, sizeof(buffer));

    // 0: the queue is empty. A datagram without payload or without the prefix is not DOOM's.
    if (len <= PEER_PREFIX)
    {
        return false;
    }

    peer = (int) ((uint32_t) buffer[0] | ((uint32_t) buffer[1] << 8) | ((uint32_t) buffer[2] << 16)
                  | ((uint32_t) buffer[3] << 24));
    len -= PEER_PREFIX;

    *packet = NET_NewPacket(len);
    memcpy((*packet)->data, buffer + PEER_PREFIX, len);
    (*packet)->len = len;
    *addr = AddressOf(peer);

    return true;
}

static void NET_Bridge_AddrToString(net_addr_t *addr, char *buffer, int buffer_len)
{
    M_snprintf(buffer, buffer_len, "peer %d", ((peer_addr_t *) addr)->peer);
}

// Releases the mapping only; the shell closes the channel itself.
static void NET_Bridge_FreeAddress(net_addr_t *addr)
{
    int i;

    for (i = 0; i < peer_table_size; ++i)
    {
        if (peer_table[i] != NULL && &peer_table[i]->addr == addr)
        {
            free(peer_table[i]);
            peer_table[i] = NULL;
            return;
        }
    }

    I_Error("NET_Bridge_FreeAddress: Attempted to remove an unused address!");
}

static net_addr_t *NET_Bridge_ResolveAddress(const char *name)
{
    int peer = haex_net_resolve(name);

    return peer < 0 ? NULL : AddressOf(peer);
}

void NET_Bridge_PeerClosed(int peer)
{
    peer_addr_t *entry = FindPeer(peer);

    // A peer without an address was never seen by the server or the client.
    if (entry != NULL)
    {
        entry->closed = true;
        closed_pending = true;
    }
}

net_module_t net_sdl_module =
{
    NET_Bridge_InitClient,
    NET_Bridge_InitServer,
    NET_Bridge_SendPacket,
    NET_Bridge_RecvPacket,
    NET_Bridge_AddrToString,
    NET_Bridge_FreeAddress,
    NET_Bridge_ResolveAddress,
};
