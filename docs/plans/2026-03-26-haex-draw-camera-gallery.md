# haex-draw – Kamera & Galerie

## Übersicht

Zwei neue Features für haex-draw: Fullscreen-Kameraaufnahme und Bild-Galerie mit Thumbnail-Leiste. Beide platzieren das Ergebnis als Image-Stencil auf dem Canvas.

## Änderungen über 3 Repositories

### Release-Reihenfolge

1. **haex-vault-sdk** releasen (neue `knownPaths()` API + `KnownPath` Enum)
2. **haex-vault** updaten (SDK bump + neuer Tauri-Command + iframe allow + WebView media stream)
3. **haex-draw** nutzt dann die neue SDK-Version

### haex-vault-sdk

- `src/commands/filesystem.ts` – Neuer Command `knownPaths`
- `src/api/filesystem.ts` – `KnownPath` Enum, `KnownPaths` Type, `knownPaths()` Methode
- `src/index.ts` – Re-export von `KnownPath` + `KnownPaths`

### haex-vault

- `src/components/haex/desktop/extension-frame.vue` – `allow="camera; microphone;"` zum iframe
- `src-tauri/src/extension/webview/manager.rs` – Media-Stream auf Extension-WebViews (Linux)
- `src-tauri/src/extension/filesystem/commands.rs` – `extension_filesystem_known_paths` Command
- `src-tauri/src/lib.rs` – Command-Registration

### haex-draw

- `app/composables/useCamera.ts` – getUserMedia, Stream-Management, Snapshot
- `app/composables/useImageGallery.ts` – Verzeichnis-Scan via `knownPaths()`, Thumbnail-Loading, LRU-Cache
- `app/components/draw/CameraOverlay.vue` – Fullscreen Kamera-UI
- `app/components/draw/ImageGallery.vue` – Bottom-Sheet mit horizontaler Thumbnail-Leiste
- `app/components/draw/GalleryThumbnail.vue` – Thumbnail mit IntersectionObserver für Lazy Loading
- `app/components/draw/Toolbar.vue` – Neue Kamera + Galerie Buttons
- `app/pages/draw/[id].vue` – CameraOverlay + ImageGallery Integration

## Features

### 1. Kamera (Fullscreen)

- Eigener Button in der Toolbar (unterhalb Stencils)
- Öffnet Fullscreen-Overlay (z-50) über den gesamten Canvas
- Zeigt Live-Kamera-Stream (`navigator.mediaDevices.getUserMedia()`)
- Capture-Button → Snapshot via Canvas → als Image-Stencil auf Canvas platzieren
- Kamera-Wechsel (Front/Back) auf Geräten mit mehreren Kameras
- Nach Capture: Vorschau mit "Verwenden" / "Nochmal" Buttons
- Schließen-Button zum Abbrechen

**Technischer Ansatz:** Direkt `getUserMedia` im WebView. Media-Stream ist bereits aktiviert in haex-vault:
- CSP `mediastream:` in `tauri.conf.json`
- Linux: `set_enable_media_stream(true)` auf main + extension WebViews
- Android: Manifest hat `<uses-permission android:name="android.permission.CAMERA" />`, OS fragt User
- iframe: `allow="camera; microphone;"` Attribut

### 2. Galerie (Bottom Sheet)

- Eigener Button in der Toolbar (unterhalb Kamera)
- Öffnet Bottom-Sheet am unteren Rand
- Horizontale Thumbnail-Leiste mit allen Bildern aus bekannten Verzeichnissen
- IntersectionObserver für Lazy-Loading der Thumbnails (erst laden wenn im Viewport)
- LRU-Cache (max 200 Einträge) für geladene Thumbnails
- Tap auf Thumbnail → als Image-Stencil auf Canvas platzieren

**Datenquelle:** SDK `client.filesystem.knownPaths()` → Tauri `PathResolver`:
- `pictures` – Bilder-Verzeichnis (plattformabhängig)
- `downloads` – Downloads
- `documents` – Dokumente
- `home` – Home-Verzeichnis (für DCIM auf Android)

**Performance-Strategie:**
1. `knownPaths()` → bekannte Verzeichnisse ermitteln
2. `readDir` rekursiv (max depth 3) → nur Pfade/Metadaten sammeln
3. Thumbnails on-demand laden wenn im Viewport (via IntersectionObserver + `readFile`)
4. Clientseitig auf 160px verkleinern und als JPEG (70%) im LRU-Cache halten
5. Bilder nach Datum sortiert (neueste zuerst, via `modified` Timestamp)

## Toolbar-Layout

```
Burger-Menü
──────────
Brush
Pan
──────────
Stencils
Camera
Gallery
──────────
Undo / Redo / History
   (spacer)
Save / Export / Clear
```

"Bild importieren" im Stencils-Menü bleibt als File-Picker-Alternative erhalten.

## Phasen

### Phase 1 (MVP) ← implementiert

- `useCamera` Composable + `CameraOverlay` Komponente
- `useImageGallery` mit `knownPaths()` + Verzeichnis-Scan
- `ImageGallery` Bottom-Sheet + `GalleryThumbnail` mit IntersectionObserver
- Toolbar-Buttons für Kamera + Galerie
- i18n (de/en)

### Phase 2 (Polish)

- Galerie expandierbar (Swipe hoch → Grid-Ansicht)
- Suchfeld in der Galerie
- Ordner-Quick-Links (DCIM, Pictures, etc.)
- Thumbnail-Caching in IndexedDB (persistent über Sessions)
