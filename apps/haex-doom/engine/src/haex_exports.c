// Functions the haex-doom shell calls into the engine (contracts/engine-bridge.md).

#include <emscripten.h>

#include "d_event.h"
#include "d_loop.h"
#include "doomstat.h"

#include "net_bridge.h"

extern void I_SetMouseMotionEnabled(boolean enabled);

// Set by G_Responder when the pause key is pressed; the next tic sends the pause.
extern boolean sendpause;

EMSCRIPTEN_KEEPALIVE
void haex_post_event(int type, int data1, int data2, int data3, int data4, int data5, int data6)
{
    event_t event = {0};

    event.type = (evtype_t) type;
    event.data1 = data1;
    event.data2 = data2;
    event.data3 = data3;
    event.data4 = data4;
    event.data5 = data5;
    event.data6 = data6;
    D_PostEvent(&event);
}

EMSCRIPTEN_KEEPALIVE
void haex_set_mouse_motion(int enabled)
{
    I_SetMouseMotionEnabled(enabled != 0);
}

// Whether the shell caused the current pause; a pause the player chose stays until the player ends it.
static boolean shell_paused = false;

// Pausing a netgame would stop every player, so only single-player games follow the shell.
EMSCRIPTEN_KEEPALIVE
void haex_set_paused(int pause)
{
    // sendpause toggles the pause on the next tic, so a request within one tic must count it.
    boolean will_be_paused = paused != sendpause;

    if (netgame)
    {
        return;
    }
    if (pause && !will_be_paused)
    {
        sendpause = !sendpause;
        shell_paused = true;
    }
    else if (!pause && shell_paused)
    {
        shell_paused = false;
        if (will_be_paused)
        {
            sendpause = !sendpause;
        }
    }
}

// The server and the client treat the peer like a node that timed out (net_bridge.c).
EMSCRIPTEN_KEEPALIVE
void haex_net_peer_closed(int peer)
{
    NET_Bridge_PeerClosed(peer);
}

extern int prndindex;

// Read-only probes of the running game, for the netgame measurements (T054) and the end-to-end
// check of the lockstep (engine/e2e). They change nothing in the engine.
// what: 0 gametic, 1 leveltime, 2 players in the game (bit n = player n), 3 console player,
// 4 netgame (0 or 1), 5 position in the random table.
EMSCRIPTEN_KEEPALIVE
int haex_debug_game(int what)
{
    int i, mask = 0;

    switch (what)
    {
        case 0: return gametic;
        case 1: return leveltime;
        case 2:
            for (i = 0; i < MAXPLAYERS; ++i)
            {
                mask |= playeringame[i] ? 1 << i : 0;
            }
            return mask;
        case 3: return consoleplayer;
        case 4: return netgame ? 1 : 0;
        case 5: return prndindex;
        default: return -1;
    }
}

// field: 0 x, 1 y, 2 angle (fixed-point map units and binary angle of the player's mobj), 3 health,
// 4 z (height of the feet, fixed-point), 5 vertical momentum (fixed-point); 0 when the player has no mobj.
EMSCRIPTEN_KEEPALIVE
int haex_debug_player(int player, int field)
{
    player_t *p;

    if (player < 0 || player >= MAXPLAYERS || !playeringame[player])
    {
        return 0;
    }
    p = &players[player];
    if (field == 3)
    {
        return p->health;
    }
    if (p->mo == NULL)
    {
        return 0;
    }
    switch (field)
    {
        case 0: return p->mo->x;
        case 1: return p->mo->y;
        case 2: return (int) p->mo->angle;
        case 4: return p->mo->z;
        case 5: return p->mo->momz;
        default: return 0;
    }
}
