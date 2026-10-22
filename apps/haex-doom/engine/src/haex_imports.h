// Functions the engine calls in the haex-doom shell (contracts/engine-bridge.md).

#ifndef HAEX_IMPORTS_H
#define HAEX_IMPORTS_H

#include <stdint.h>

void haex_file_written(const char *path);
void haex_file_removed(const char *path);
void haex_haptic(int kind);
void haex_net_send(int peer, const uint8_t *data, int len);
int haex_net_recv(uint8_t *buf, int cap);
int haex_net_resolve(const char *name);

// Waits for the next display frame (or 100 ms while the page is hidden) and yields to the browser.
void haex_wait_frame(void);

#endif
