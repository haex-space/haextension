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
