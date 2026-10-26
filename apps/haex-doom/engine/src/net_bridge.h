// The network module of haex-doom: DOOM's netcode over the peer channels of the vault
// (contracts/engine-bridge.md, "Network module rules").

#ifndef NET_BRIDGE_H
#define NET_BRIDGE_H

// A peer channel closed. Called from JavaScript between two engine frames; the engine learns
// about it on its next poll of the network module.
void NET_Bridge_PeerClosed(int peer);

#endif
