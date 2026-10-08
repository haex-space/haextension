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

## Inputs with a floating label

`UiInput`, `UiInputPassword`, `UiTextarea` and `UiSelect` take a `label`. At rest it lies inside the
field like a placeholder; with focus or a value it moves onto the border (pure CSS: the field is a
`peer`, `placeholder=" "` tells empty from filled). The label covers the border with the colour of the
surface behind the field, which defaults to `--background`; set `label-bg` (any CSS colour, for
example `var(--muted)`) where the field sits on another surface.

```vue
<UiInput v-model="name" label="Name" label-bg="var(--muted)" :error="nameError" clearable />
<UiInputPassword v-model="secret" label="Passwort" copyable :labels="{ show, hide, copy, copied }" />
<UiTextarea v-model="note" label="Notiz" />
<UiSelect v-model="algorithm" label="Algorithmus" :options="[{ value: 'SHA1', label: 'SHA-1' }]" />
```

A real `placeholder` is shown only while the field has focus. `error` marks the field invalid and shows
the text under it. The focus ring of every field is `--primary`, so an app that lets its users change
`--primary` at runtime changes the rings and the labels with it. Texts of the buttons (`labels`) are
passed in by the app; the defaults are German.

## Radio groups

`ShadcnRadioGroup` holds the choices; arrow keys move between them. `ShadcnRadioGroupItem` is the
round radio button, `UiRadioGroupTile` an item without a look of its own for swatches, icons or
segments (style the checked one with `data-[state=checked]:`).

```vue
<ShadcnRadioGroup v-model="mode">
  <label class="flex items-center gap-2"><ShadcnRadioGroupItem value="auto" /> Auto</label>
  <label class="flex items-center gap-2"><ShadcnRadioGroupItem value="manual" /> Manuell</label>
</ShadcnRadioGroup>

<ShadcnRadioGroup v-model="color" class="flex gap-2">
  <UiRadioGroupTile v-for="c in colors" :key="c" :value="c" :aria-label="c"
    class="size-7 rounded-full border-2 border-transparent data-[state=checked]:border-foreground"
    :style="{ backgroundColor: c }" />
</ShadcnRadioGroup>
```

## Compatibility

This layer currently supports Nuxt 4.2.2 and newer (`nuxt ^4.2.2`). Nuxt 3.21
layer consumption is not currently supported: `nuxi build` fails while
processing the layer's globally registered components with
`No fs option provided to compileScript in non-Node environment`.

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
