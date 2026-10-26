// Functions the engine calls in the haex-doom shell (contracts/engine-bridge.md).

#ifndef HAEX_IMPORTS_H
#define HAEX_IMPORTS_H

#include <stdint.h>

void haex_file_written(const char *path);
void haex_file_removed(const char *path);
void haex_haptic(int kind);
// Whether the shell has a peer session for the netgame (a lobby with connected players).
int haex_net_active(void);
void haex_net_send(int peer, const uint8_t *data, int len);
int haex_net_recv(uint8_t *buf, int cap);
int haex_net_resolve(const char *name);

// The engine is about to exit: `is_error` is set by I_Error, `message` is the error text, a notice
// for the player (such as the host having left), or empty for a plain Quit.
void haex_engine_exit(int is_error, const char *message);

// Waits for the next display frame (or 100 ms while the page is hidden) and yields to the browser.
void haex_wait_frame(void);

#endif
