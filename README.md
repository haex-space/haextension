# Haextension

Monorepo for HaexVault core extensions.

## Structure

```
haextension/
├── apps/
│   └── haex-pass/     # Password manager extension
└── packages/
    └── haex-ui/       # Shared UI components for extensions
```

## Getting Started

```bash
# Install dependencies
pnpm install

# Run haex-pass in development
pnpm --filter haex-pass dev
```

## Extensions

### haex-pass

Password manager extension for HaexVault. Features:
- Secure password storage
- Password generator
- KeePass import
- Browser autofill

## Packages

### haex-ui

Shared Vue/Nuxt UI components based on shadcn-vue for building HaexVault extensions.
