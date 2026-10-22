// Functions the haex-doom shell calls into the engine (contracts/engine-bridge.md).

#include <emscripten.h>

#include "d_event.h"
#include "doomstat.h"

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

EMSCRIPTEN_KEEPALIVE
void haex_net_peer_closed(int peer)
{
    (void) peer;
}
