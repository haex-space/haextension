# haex-ui: publish as `@haex-space/ui` and make it app-agnostic

**Date**: 2026-09-17
**Status**: design validated, implementation pending
**Scope**: `packages/haex-ui` only. Consuming apps in this monorepo are not
changed by this plan; the first external consumer is `ifa-board`.

## Problem

`packages/haex-ui` is a Nuxt layer that is only reachable by path
(`extends: ["../../packages/haex-ui"]`) or by giget
(`extends: ["github:haex-space/haextension/packages/haex-ui#<sha>"]`, as
`holzi` does). The giget route has two costs, both caused by the layer
landing in an unpredictable `node_modules/.c12/<hash>/` directory:

- Tailwind v4 cannot `@import` the layer's `assets/css/theme.css`, so
  consumers copy the whole `@theme inline` + `:root` + `.dark` block
  (~100 lines in `holzi/src/assets/css/tailwind.css`) and drift silently.
- `@source` has to glob the entire `.c12` cache
  (`@source "../../../node_modules/.c12/**/*.vue"`), scanning every other
  git layer as well.

A second, independent problem: the layer hard-wires `@nuxtjs/i18n` as a
module and defines `i18n.locales`. Only three `Ui*` components call
`useI18n()` (six keys: `show`, `hide`, `copy`, `copied`, `hour`, `minute`),
and the translations for those keys live in each app, not in the layer.
Every consumer is therefore forced to install and configure i18n even if it
has a single language.

## Decision

1. **Publish the layer to npm as `@haex-space/ui`.** The org already
   publishes `@haex-space/vault-sdk`, `ucan`, `marketplace-sdk`,
   `federation-sdk` and `federation` under that scope; `@haex/*` is not in
   use and its ownership is unverified. The package name in
   `packages/haex-ui/package.json` changes from `@haex/ui` to
   `@haex-space/ui`. Path- and giget-based consumers are unaffected by the
   rename because they never reference the package name.
2. **Drop i18n from the layer.** Remove `@nuxtjs/i18n` from `modules` and
   the `i18n` block from `nuxt.config.ts`. The three components take their
   labels as props with German defaults; apps that want translations pass
   `t(...)` results in. All ten apps in `apps/*` already list `@nuxtjs/i18n`
   in their own `modules` and define their own locales, so nothing breaks
   for them.
3. **Add the components the first external consumer needs**, via the
   shadcn-vue CLI inside `packages/haex-ui`: `toggle-group` (segmented
   single-select, used for touch point entry), `table`, `number-field`
   (stepper). These are plain shadcn additions and follow the existing
   `components/shadcn/<name>/` layout.

## Package layout for publishing

`packages/haex-ui/package.json` gains:

```json
{
  "name": "@haex-space/ui",
  "version": "0.1.0",
  "license": "<same as repo>",
  "repository": { "type": "git", "url": "https://github.com/haex-space/haextension", "directory": "packages/haex-ui" },
  "files": ["nuxt.config.ts", "components", "lib", "plugins", "assets", "components.json", "README.md"],
  "publishConfig": { "access": "public" }
}
```

No `exports` field: consumers must be able to deep-import
`@haex-space/ui/assets/css/theme.css`, and Nuxt resolves the layer through
`main: ./nuxt.config.ts` as today. `tailwind.config.ts` is empty and is not
shipped. `peerDependencies` stay as they are minus `@nuxtjs/i18n`.

## Release mechanics

- Tag format `ui-v<semver>` (the existing `haex-*-v*` pattern is reserved
  for extensions; `extension-release.yml` must not match `ui-v*`, which it
  does not today).
- New workflow `.github/workflows/ui-release.yml`: on tag `ui-v*`, checkout,
  pnpm, `pnpm --filter @haex-space/ui publish --access public
  --no-git-checks`, authenticated with an `NPM_TOKEN` repository secret
  (granular token with publish rights on `@haex-space`). Publishing from a
  developer machine is not planned; this machine has no npm login.
- Version bump is a manual edit + tag for now. Extending
  `scripts/release.js` to know about `haex-ui` is optional follow-up.

## Consumer contract (what an app does)

```ts
// nuxt.config.ts
import tailwindcss from '@tailwindcss/vite'
export default defineNuxtConfig({
  extends: ['@haex-space/ui'],
  build: { transpile: ['reka-ui'] },
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
})
```

```css
/* assets/css/main.css */
@import "tailwindcss";
@import "tw-animate-css";
@import "@haex-space/ui/assets/css/theme.css";
@source "../../../node_modules/@haex-space/ui/components";
@custom-variant dark (&:is(.dark *));

:root { --primary: oklch(0.55 0.17 145); }   /* app-specific accent */
.dark { --primary: oklch(0.65 0.15 145); }

@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground; }
}
```

The app installs the layer's peers explicitly (`reka-ui`, `@lucide/vue`,
`vue-sonner`, `vaul-vue`, `embla-carousel-vue`, `class-variance-authority`,
`@internationalized/date`, `tailwind-merge@3`, `@vueuse/core@14`,
`tailwindcss@4`, `@tailwindcss/vite`, `tw-animate-css`). Nuxt 3.2x with
`future.compatibilityVersion: 4` is expected to work; the layer uses no
Nuxt-4-only API. `nuxt ^4` stays the declared peer; a 3.x host gets a peer
warning, not an error.

Dark mode is opt-in: without `@nuxtjs/color-mode` (or a manual `.dark`
class) the light tokens apply.

## Migration of existing consumers

- `holzi`: can switch from `github:…#sha` to `@haex-space/ui@<version>`,
  delete the copied theme block and the `.c12` globs, and keep its own
  `--primary` override. Not part of this plan; recorded so the benefit is
  visible.
- Monorepo apps: no change required. Optionally switch from the relative
  `extends` path to the workspace package (`"@haex-space/ui": "workspace:*"`)
  later.

## Out of scope

- Storybook / visual regression for the layer.
- Renaming component prefixes (`Shadcn*`, `Ui*`) or the `@/lib/utils`
  alias trick.
- Automating the version bump.

## Verification

1. `pnpm --filter @haex-space/ui exec nuxi prepare` succeeds after the
   i18n removal (no `useI18n` left in `components/`).
2. One monorepo app (`haex-notes`) still builds with the relative extends.
3. `npm pack` in `packages/haex-ui` lists exactly the `files` above.
4. A scratch project outside the monorepo installs `@haex-space/ui`,
   applies the consumer contract, and renders `ShadcnButton`,
   `ShadcnDialog`, `ShadcnToggleGroup` with theme classes present in the
   built CSS.
