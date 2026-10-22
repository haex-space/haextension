// Functions the haex-doom shell calls into the engine (contracts/engine-bridge.md).

#include <emscripten.h>

#include "d_event.h"
#include "doomstat.h"

// Set by G_Responder when the pause key is pressed; the next tic sends the pause.
extern boolean sendpause;

EMSCRIPTEN_KEEPALIVE
void haex_post_event(int type, int data1, int data2, int data3, int data4)
{
    event_t event = {0};

    event.type = (evtype_t) type;
    event.data1 = data1;
    event.data2 = data2;
    event.data3 = data3;
    event.data4 = data4;
    D_PostEvent(&event);
}

// Pausing a netgame would stop every player, so only single-player games follow the shell.
EMSCRIPTEN_KEEPALIVE
void haex_set_paused(int pause)
{
    if (!netgame && (boolean) (pause != 0) != paused)
    {
        sendpause = true;
    }
}

EMSCRIPTEN_KEEPALIVE
void haex_net_peer_closed(int peer)
{
    (void) peer;
}
