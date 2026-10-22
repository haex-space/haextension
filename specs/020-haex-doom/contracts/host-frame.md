# Contract: extension frame capabilities in the vault host

Host changes H1 and H2 in `haex-space/haex-vault`, each its own pull request. They apply to all extensions; no manifest change.

## H1 — WebAssembly

`src-tauri/src/extensions/protocol/csp.rs`, `policy()`:

```text
script-src {prefix} 'wasm-unsafe-eval' {inline hashes}
```

Check: an extension page can call `WebAssembly.instantiateStreaming(fetch('x.wasm'))` and `eval('1')` still throws.

## H2 — Pointer lock and fullscreen

`src/components/extensions/ExtensionFrame.vue`:

```html
<iframe sandbox="allow-scripts allow-pointer-lock" allow="fullscreen" …>
```

Check: inside a frame, `canvas.requestPointerLock()` after a click succeeds on desktop and Esc releases it; `element.requestFullscreen()` after a click fills the window and Esc leaves it. On Android, `requestFullscreen()` may reject; the extension falls back (research R-5).

## Detection by the extension

| Capability | Detection |
|---|---|
| WebAssembly | Engine load succeeds; otherwise the start screen says the vault must be updated. |
| Pointer lock | `'requestPointerLock' in Element.prototype` and the first lock attempt succeeds (`pointerlockchange`); on `pointerlockerror` mouse options are hidden (FR-009). |
| Fullscreen | `document.fullscreenEnabled`; on rejection the in-tab fallback is used (FR-010). |
| Peer channels | `client.peers` exists and the host does not answer "Unknown method"; otherwise the multiplayer entry is hidden (SC-007). |
