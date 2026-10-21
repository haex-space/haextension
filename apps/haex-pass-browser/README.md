# HaexPass Browser Extension

Browser extension for the [HaexPass](https://github.com/haex-space/haex-pass) password manager. Seamlessly autofill your credentials from HaexVault directly in your browser.

<p align="center">
  <img src="extension/assets/haex-pass-logo.png" alt="HaexPass" width="128">
</p>

## Features

- **Secure Connection** - Encrypted WebSocket connection to HaexVault
- **Auto-Detection** - Automatically detects login forms on websites
- **Smart Autofill** - Fill username and password with one click
- **Multi-Browser Support** - Works on Chrome, Firefox, and Chromium-based browsers
- **Configurable** - Customize WebSocket port and language settings
- **Privacy-First** - No data collection, all credentials stay local

## Installation

### Firefox

Download the latest `.xpi` from the [Releases](https://github.com/haex-space/haextension/releases) page or install from [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/haexpass/).

### Chrome / Chromium

Download the latest `.zip` from the [Releases](https://github.com/haex-space/haextension/releases) page, extract it, and load as an unpacked extension:

1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the extracted folder

## Usage

1. **Start HaexVault** on your computer
2. Click the HaexPass icon in your browser toolbar
3. Click "Connect" to establish a connection
4. Approve the connection in HaexVault
5. Navigate to any login page - click the HaexPass icon in input fields to autofill

## Settings

Access settings via the extension popup (gear icon):

- **Language** - Choose between Auto, English, or German
- **WebSocket Port** - Configure the port HaexVault listens on (default: 19455)

## Development

### Prerequisites

- Node.js 22+
- pnpm 9+

### Setup

```bash
# Clone the repository
git clone https://github.com/haex-space/haextension
cd haextension

# Install dependencies
pnpm install

# Navigate to the extension
cd apps/haex-pass-browser
```

### Development Mode

```bash
# Chrome/Chromium
pnpm dev

# Firefox
pnpm dev-firefox
```

Then load the `extension/` folder in your browser.

### Building

```bash
# Build for Chrome
pnpm build
pnpm pack:zip

# Build for Firefox
EXTENSION=firefox pnpm build
pnpm pack:xpi
```

### Project Structure

```
src/
├── background/      # Service worker / background script
├── contentScripts/  # Content scripts for form detection
├── popup/           # Extension popup UI
├── options/         # Settings page
├── locales/         # i18n translations
├── logic/           # Shared business logic
└── manifest.ts      # Dynamic manifest generation
```

## Tech Stack

- **Vue 3** - UI framework with Composition API
- **Vite** - Build tool with HMR
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **webext-bridge** - Cross-context messaging
- **@haex-space/vault-sdk** - HaexVault communication

## License

MIT
