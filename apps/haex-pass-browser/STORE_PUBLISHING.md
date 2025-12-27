# Browser Extension Store Publishing

Diese Dokumentation erklärt, wie die automatische Veröffentlichung zu Chrome Web Store und Firefox Add-ons eingerichtet wird.

## Voraussetzungen

Bevor die automatische Veröffentlichung funktioniert, muss die Extension einmalig manuell in beiden Stores hochgeladen werden.

## GitHub Secrets

Folgende Secrets müssen im GitHub Repository konfiguriert werden:

### Chrome Web Store

| Secret | Beschreibung |
|--------|--------------|
| `CHROME_EXTENSION_ID` | Die Extension-ID aus dem Chrome Web Store (z.B. `abcdefghijklmnopqrstuvwxyz`) |
| `CHROME_CLIENT_ID` | OAuth2 Client ID von Google Cloud Console |
| `CHROME_CLIENT_SECRET` | OAuth2 Client Secret |
| `CHROME_REFRESH_TOKEN` | OAuth2 Refresh Token |

#### Chrome Credentials erstellen

1. Gehe zur [Google Cloud Console](https://console.cloud.google.com/)
2. Erstelle ein neues Projekt oder wähle ein bestehendes
3. Aktiviere die **Chrome Web Store API**
4. Gehe zu **APIs & Services → Credentials**
5. Erstelle **OAuth 2.0 Client ID** (Desktop App)
6. Notiere `Client ID` und `Client Secret`
7. Generiere den Refresh Token:

```bash
# OAuth URL aufrufen (im Browser)
https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&client_id=YOUR_CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob

# Authorization Code kopieren und Token anfordern:
curl -X POST \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "code=YOUR_AUTH_CODE" \
  -d "grant_type=authorization_code" \
  -d "redirect_uri=urn:ietf:wg:oauth:2.0:oob" \
  https://oauth2.googleapis.com/token
```

Die Response enthält den `refresh_token`.

### Firefox Add-ons (AMO)

| Secret | Beschreibung |
|--------|--------------|
| `FIREFOX_ADDON_ID` | Die Add-on ID/GUID (z.B. `{12345678-1234-1234-1234-123456789abc}` oder `haex-pass@haex.space`) |
| `FIREFOX_ADDON_SLUG` | Der URL-Slug für den Store-Link (z.B. `haex-pass`) |
| `FIREFOX_API_ISSUER` | JWT API Key (Issuer) |
| `FIREFOX_API_SECRET` | JWT API Secret |

#### Firefox Credentials erstellen

1. Gehe zu [AMO Developer Hub](https://addons.mozilla.org/developers/)
2. Klicke auf **My API Keys** (unter deinem Profil)
3. Generiere neue API Credentials
4. Notiere `JWT issuer` und `JWT secret`

## Workflow Nutzung

### Automatischer Release (via Tag)

```bash
cd apps/haex-pass-browser
pnpm publish:patch  # Erhöht Version, erstellt Tag, pusht
```

Der Workflow wird automatisch durch den Tag `haex-pass-browser-v*` getriggert.

### Manueller Release

1. Gehe zu **Actions → Release Browser Extension**
2. Klicke **Run workflow**
3. Gib die Version ein (z.B. `1.0.6`)
4. Optional: Aktiviere "Skip publishing to Chrome/Firefox stores" für nur GitHub Release

### Nur GitHub Release (ohne Store)

Verwende die Option `skip_stores: true` beim manuellen Workflow-Trigger.

## Wichtige Hinweise

### Erstmalige Veröffentlichung

- **Chrome**: Die Extension muss zuerst manuell im [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/developer/dashboard) hochgeladen werden
- **Firefox**: Die Extension muss zuerst manuell im [AMO Developer Hub](https://addons.mozilla.org/developers/) hochgeladen werden

### Review-Zeiten

- **Chrome**: 1-3 Werktage
- **Firefox**: Wenige Stunden bis 1 Tag (automatische Signierung für Updates)

### Source Code (Firefox)

Firefox erfordert bei minifizierten/transpilierten Extensions den Source Code zur Review. Der Workflow lädt automatisch die relevanten Quelldateien hoch.

## Troubleshooting

### Chrome: "Invalid token"
- Refresh Token ist abgelaufen → Neuen generieren
- Falscher Client ID/Secret → Überprüfen

### Firefox: "Timeout waiting for validation"
- AMO Server überlastet → Workflow erneut starten
- Validation dauert manchmal bis zu 10 Minuten

### Secrets nicht gefunden
- Secrets unter Settings → Secrets and variables → Actions hinzufügen
- Repository-Secrets, nicht Environment-Secrets verwenden
