# @haex-space/ui

Nuxt layer: shadcn-vue (reka-ui) components registered globally as `Shadcn*`,
a few composed components as `Ui*`, and the haex theme tokens (oklch CSS
variables, light + `.dark`).

## Use

```bash
pnpm add @haex-space/ui reka-ui @lucide/vue vue-sonner vaul-vue embla-carousel-vue \
  class-variance-authority clsx tailwind-merge @internationalized/date @vueuse/core \
  tailwindcss @tailwindcss/vite tw-animate-css
```

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

:root { --primary: oklch(0.65 0.17 180); }
.dark { --primary: oklch(0.7 0.15 180); }

@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground; }
}
```

The `@source` line is required: Tailwind v4 does not scan `node_modules` on
its own. Adjust the relative path to where your CSS file lives.

Dark mode is opt-in: add the `dark` class to `<html>` (for example via
`@nuxtjs/color-mode` with `classSuffix: ''`).

## Release

Bump `version` in `packages/haex-ui/package.json`, merge, then push a tag
`ui-v<version>`. `.github/workflows/ui-release.yml` publishes to npm.

**First release only:** npm requires a package to already exist before
Trusted Publishing can be configured for it, so the very first `ui-v*` tag
must publish using the `NPM_TOKEN` repo secret (a classic granular token
with publish rights on `@haex-space`).

**After the first release:** configure npm Trusted Publishing so future
releases need no token at all — on the package's Settings page on npmjs.com,
add a Trusted Publisher: provider GitHub Actions, organization/user
`haex-space`, repository `haextension`, workflow filename `ui-release.yml`
(just the filename, not the path). The workflow already requests
`id-token: write`; npm's CLI (and pnpm ≥ 10, which this repo pins) detects
the OIDC token automatically and prefers it over `NODE_AUTH_TOKEN`. The
`NPM_TOKEN` secret can then be removed.
