// Each import forwards to `Module.haexImports` (app/lib/engine/imports.ts) and does nothing
// when the shell has not provided it, so the engine also runs outside the extension.

#include <emscripten.h>

#include "haex_imports.h"

EM_JS(void, haex_file_written, (const char *path), {
    Module.haexImports?.fileWritten?.(UTF8ToString(path));
});

EM_JS(void, haex_file_removed, (const char *path), {
    Module.haexImports?.fileRemoved?.(UTF8ToString(path));
});

EM_JS(void, haex_haptic, (int kind), {
    Module.haexImports?.haptic?.(kind);
});

EM_JS(void, haex_net_send, (int peer, const uint8_t *data, int len), {
    Module.haexImports?.netSend?.(peer, HEAPU8.slice(data, data + len));
});

EM_JS(int, haex_net_recv, (uint8_t *buf, int cap), {
    return Module.haexImports?.netRecv?.(HEAPU8.subarray(buf, buf + cap)) ?? 0;
});

EM_JS(int, haex_net_resolve, (const char *name), {
    return Module.haexImports?.netResolve?.(UTF8ToString(name)) ?? -1;
});

// requestAnimationFrame stops in hidden pages; the timeout keeps netgames ticking there.
EM_ASYNC_JS(void, haex_wait_frame, (), {
    await new Promise((resolve) => {
        const timer = setTimeout(resolve, 100);
        requestAnimationFrame(() => {
            clearTimeout(timer);
            resolve();
        });
    });
});
