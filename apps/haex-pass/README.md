# HaexPass

A modern password manager, inspired by KeePass – but better.

## Why HaexPass?

KeePass is great and one of my favorite tools. But some things always bothered me:

- **Inconsistent UI** – KeePass looks and behaves differently on every platform. Features are missing here and there.
- **No responsive design** – It quickly becomes cluttered on smaller screens.
- **No fuzzy search** – You need to know the exact name to find entries.
- **Syncing is painful** – Anyone using KeePass on multiple devices knows this: keeping database files in sync is tedious and error-prone.

**HaexPass solves all of these problems.** It offers almost all KeePass features – plus a consistent, responsive interface, fast fuzzy search, and seamless synchronization via HaexSpace.

## Features

- KeePass compatible (KDBX import)
- Consistent UI across all devices
- Responsive design
- Fuzzy search for quick access
- Automatic sync via HaexSpace
- TOTP support (2FA)
- Secure end-to-end encryption

## Installation

HaexPass is available as an extension for [HaexSpace](https://haex.space):

**[HaexPass on the Marketplace](https://haex.space/marketplace/haex-pass)**

## Development

### Prerequisites

- Node.js 18+
- pnpm

### Setup

```bash
# Clone the repository
git clone https://github.com/haex-space/haextension.git
cd haextension

# Install dependencies
pnpm install

# Navigate to haex-pass
cd apps/haex-pass

# Start development server
pnpm dev
```

### Build

```bash
# Build and sign the extension
pnpm build:release
```

## License

MIT
