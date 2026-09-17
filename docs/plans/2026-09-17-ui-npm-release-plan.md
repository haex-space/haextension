# haex-ui npm Release Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish `packages/haex-ui` to npm as `@haex-space/ui`, free of the forced i18n module, with `toggle-group`, `table` and `number-field` added, so external Nuxt apps (first: `ifa-board`) can `extends: ['@haex-space/ui']`.

**Architecture:** The layer stays a plain Nuxt layer (`main: ./nuxt.config.ts`, global `Shadcn*`/`Ui*` components). Publishing only adds package metadata and a tag-triggered workflow. i18n leaves the layer by turning the six translated strings in three `Ui*` components into props with German defaults. Design rationale: [2026-09-17-ui-layer-npm-release-design.md](./2026-09-17-ui-layer-npm-release-design.md).

**Tech Stack:** pnpm 10 workspace, Nuxt 4 layer, reka-ui 2, Tailwind 4, shadcn-vue CLI 2.8.2, GitHub Actions, npm registry (scope `@haex-space`).

**Worktree:** `/home/haex/Projekte/haextension/.worktrees/ui-npm-release`, branch `feat/ui-npm-release` (from `origin/main` @ 18fba54). Dependencies are installed. Baseline verified: `pnpm exec nuxi prepare` in `packages/haex-ui` succeeds.

**Conventions (repo):** commit messages English, short, imperative, no AI attribution lines. Run every command from the worktree root unless a task says otherwise. After code changes run `graphify update .` once at the end (repo CLAUDE.md rule; skip if `graphify` is not on PATH and say so).

**Known limits before release (need Martin, not code):**
- Repo secret `NPM_TOKEN` (granular npm token with publish rights on `@haex-space`) must exist before the first `ui-v*` tag.
- License: the repo has no LICENSE file; the org's npm packages declare `ISC`. This plan uses `ISC`. Confirm in the PR.
- **Accepted behavior change (decided 2026-09-17, do not "fix" without asking):** removing i18n
  from `UiInputPassword`, `UiTextarea`, `UiTimePicker` in Task 3 means their existing call sites in
  `apps/haex-mail/app/components/AccountForm.vue` (1×) and
  `apps/haex-calendar/app/components/calendar/{EventDrawer,QuickCreate}.vue` (4×) — none of which pass
  a `labels` prop today — will render the German defaults regardless of the app's active locale,
  until someone adds `labels` there. `apps/haex-pass` also uses `UiTextarea` (3×) but is archived and
  no longer released. Only tooltips/placeholders are affected, not functionality. This plan
  deliberately does not touch `apps/**` beyond the one-line rename in Task 2 — updating the call
  sites is a separate, later change.

---

### Task 1: Ignore `.worktrees/` and add the docs

**Files:**
- Modify: `.gitignore`
- Add: `docs/plans/2026-09-17-ui-layer-npm-release-design.md` (already copied into the worktree)
- Add: `docs/plans/2026-09-17-ui-npm-release-plan.md` (this file)

**Step 1: Append to `.gitignore`** (after the `graphify-out/` line):

```
# git worktrees
.worktrees/
```

**Step 2: Verify**

Run: `git check-ignore -v .worktrees`
Expected: a line ending in `.gitignore:…:.worktrees/	.worktrees`

**Step 3: Commit**

```bash
git add .gitignore docs/plans/2026-09-17-ui-layer-npm-release-design.md docs/plans/2026-09-17-ui-npm-release-plan.md
git commit -m "docs: haex-ui npm release design and plan"
```

---

### Task 2: Rename to `@haex-space/ui` and add publish metadata

**Files:**
- Modify: `packages/haex-ui/package.json`
- Create: `packages/haex-ui/README.md`
- Modify: `apps/haex-pass-browser/package.json:41`
- Modify: `pnpm-lock.yaml` (regenerated)

**Step 1: Replace `packages/haex-ui/package.json` with:**

```json
{
  "name": "@haex-space/ui",
  "version": "0.1.0",
  "description": "Nuxt layer with shadcn-vue (reka-ui) components and the haex theme tokens",
  "license": "ISC",
  "repository": {
    "type": "git",
    "url": "https://github.com/haex-space/haextension.git",
    "directory": "packages/haex-ui"
  },
  "type": "module",
  "main": "./nuxt.config.ts",
  "files": [
    "nuxt.config.ts",
    "components",
    "lib",
    "plugins",
    "assets",
    "components.json",
    "README.md"
  ],
  "publishConfig": {
    "access": "public"
  },
  "peerDependencies": {
    "@internationalized/date": "^3.10.1",
    "@nuxtjs/i18n": "^10.2.1",
    "@tailwindcss/vite": "^4.1.18",
    "@vueuse/core": "^14.1.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "embla-carousel-vue": "^8.6.0",
    "@lucide/vue": "^1.45.0",
    "nuxt": "^4.2.2",
    "reka-ui": "^2.6.1",
    "tailwind-merge": "^3.4.0",
    "tailwindcss": "^4.1.18",
    "tw-animate-css": "^1.4.0",
    "vaul-vue": "^0.4.1",
    "vue": "^3.5.0",
    "vue-sonner": "^2.0.9"
  }
}
```

(`shadcn-nuxt` is dropped here: the layer never loads that module, it only exists in consuming apps. `@nuxtjs/i18n` is removed from peers in Task 3, not here, so each commit stays single-purpose.)

**Step 2: Create `packages/haex-ui/README.md`:**

````markdown
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
````

**Step 3: Rename the workspace dependency**

In `apps/haex-pass-browser/package.json` change line 41 from
`"@haex/ui": "workspace:*",` to `"@haex-space/ui": "workspace:*",`.

**Step 4: Regenerate the lockfile**

Run: `pnpm install`
Expected: finishes without "ERR"; `git diff --stat pnpm-lock.yaml` shows a small change.

Run: `git diff pnpm-lock.yaml | grep -E "^[+-] +'?@haex"`
Expected: exactly a `-      '@haex/ui':` and a `+      '@haex-space/ui':` line (plus nothing else about `@haex`).

**Step 5: Verify the publish contents**

Run: `cd packages/haex-ui && npm pack --dry-run 2>&1 | grep -E "^npm notice" | sed 's/npm notice //' ; cd ../..`
Expected: the file list contains `nuxt.config.ts`, `package.json`, `README.md`, `components.json`, `lib/utils.ts`, `plugins/ssr-width.ts`, `assets/css/tailwind.css`, `assets/css/theme.css`, every file under `components/shadcn/**` and `components/ui/**`; it does NOT contain `tailwind.config.ts`, `tsconfig.json`, `.nuxt/`, `node_modules/`. Package name line reads `@haex-space/ui@0.1.0`.

**Step 6: Verify the layer still resolves**

Run: `cd packages/haex-ui && pnpm exec nuxi prepare && cd ../..`
Expected: `Types generated in .nuxt.`

**Step 7: Commit**

```bash
git add packages/haex-ui/package.json packages/haex-ui/README.md apps/haex-pass-browser/package.json pnpm-lock.yaml
git commit -m "feat(haex-ui): rename to @haex-space/ui and add publish metadata"
```

---

### Task 3: Remove i18n from the layer

**Files:**
- Modify: `packages/haex-ui/nuxt.config.ts`
- Modify: `packages/haex-ui/package.json` (peer `@nuxtjs/i18n`)
- Modify: `packages/haex-ui/components/ui/input/password.vue`
- Modify: `packages/haex-ui/components/ui/textarea/index.vue`
- Modify: `packages/haex-ui/components/ui/time-picker/index.vue`

**Step 1: Replace `packages/haex-ui/nuxt.config.ts` with:**

```ts
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineNuxtConfig({
  components: [
    // Shadcn components - naked shadcn-vue components
    // Use Shadcn* prefix to access these
    {
      path: './components/shadcn',
      prefix: 'Shadcn',
      pathPrefix: true,
      extensions: ['.vue'],
      global: true,
    },
    // UI components - generic reusable components with custom UI/UX logic
    // Built on top of shadcn, usable by all apps
    // Use Ui* prefix to access these (e.g., UiDrawerModal, UiInputPassword)
    {
      path: './components/ui',
      prefix: 'Ui',
      pathPrefix: true,
      extensions: ['.vue'],
      global: true,
    },
  ],

  alias: {
    '@/lib/utils': resolve(__dirname, './lib/utils'),
    '@/components/shadcn': resolve(__dirname, './components/shadcn'),
  },

  build: {
    transpile: ['reka-ui'],
  },
})
```

**Step 2: Remove the peer**

In `packages/haex-ui/package.json` delete the line `"@nuxtjs/i18n": "^10.2.1",`.

**Step 3: Replace `components/ui/input/password.vue` with:**

```vue
<template>
  <UiInput
    ref="inputRef"
    v-model="model"
    :type="showPassword ? 'text' : 'password'"
    v-bind="$attrs"
  >
    <template #append>
      <UiButton
        :icon="showPassword ? EyeOff : Eye"
        :tooltip="showPassword ? labels.hide : labels.show"
        variant="ghost"
        class="shadow-none"
        @click.prevent="showPassword = !showPassword"
      />
      <UiButton
        v-if="copyable"
        :icon="copied ? Check : Copy"
        :tooltip="copied ? labels.copied : labels.copy"
        variant="ghost"
        class="shadow-none"
        @click.prevent="handleCopy"
      />
    </template>
  </UiInput>
</template>

<script setup lang="ts">
import { useClipboard } from "@vueuse/core";
import { Eye, EyeOff, Copy, Check } from "@lucide/vue";

export type UiInputPasswordLabels = {
  show: string;
  hide: string;
  copy: string;
  copied: string;
};

withDefaults(
  defineProps<{
    copyable?: boolean;
    /** Tooltip texts. Pass translated strings from the app; defaults are German. */
    labels?: UiInputPasswordLabels;
  }>(),
  {
    copyable: false,
    labels: () => ({
      show: "Passwort anzeigen",
      hide: "Passwort verbergen",
      copy: "Kopieren",
      copied: "Kopiert!",
    }),
  },
);

const model = defineModel<string | null>();

const showPassword = ref(false);
const { copy, copied } = useClipboard();

const handleCopy = async () => {
  if (model.value) {
    await copy(model.value);
  }
};
</script>
```

**Step 4: Edit `components/ui/textarea/index.vue`**

Replace the `<script setup>` block's props/i18n part. The full new `<script setup>`:

```ts
import type { HTMLAttributes } from "vue";
import { useClipboard } from "@vueuse/core";
import { Copy, Check } from "@lucide/vue";

defineOptions({ inheritAttrs: false });

export type UiTextareaLabels = {
  copy: string;
  copied: string;
};

const props = withDefaults(
  defineProps<{
    withCopy?: boolean;
    class?: HTMLAttributes["class"];
    /** Tooltip texts for the copy button. Defaults are German. */
    labels?: UiTextareaLabels;
  }>(),
  {
    withCopy: false,
    class: undefined,
    labels: () => ({ copy: "Kopieren", copied: "Kopiert!" }),
  },
);

const modelValue = defineModel<string | number | null | undefined>();

// Convert null to undefined for ShadcnTextarea compatibility
const textareaValue = computed({
  get: () => modelValue.value ?? undefined,
  set: (val) => { modelValue.value = val; },
});

const { copy, copied } = useClipboard();

const textareaRef = useTemplateRef("textareaRef");

const handleCopy = async () => {
  if (modelValue.value) {
    await copy(String(modelValue.value));
  }
};

const focus = () => {
  textareaRef.value?.$el?.focus();
};

defineExpose({ focus });
```

In the template change `:tooltip="copied ? t('copied') : t('copy')"` to `:tooltip="copied ? props.labels.copied : props.labels.copy"`. Delete the whole `<i18n lang="yaml">…</i18n>` block at the end of the file. Keep `<style scoped>` unchanged.

**Step 5: Edit `components/ui/time-picker/index.vue`**

In the template change `:placeholder="t('hour')"` to `:placeholder="labels.hour"` and `:placeholder="t('minute')"` to `:placeholder="labels.minute"`. Replace the `<script setup>` with:

```ts
import type { AcceptableValue } from "reka-ui";

export type UiTimePickerLabels = {
  hour: string;
  minute: string;
};

withDefaults(
  defineProps<{
    /** Select placeholders. Defaults are German abbreviations. */
    labels?: UiTimePickerLabels;
  }>(),
  {
    labels: () => ({ hour: "Std", minute: "Min" }),
  },
);

const model = defineModel<string>({ default: "09:00" });

const hourOptions = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const minuteOptions = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));

const selectedHour = computed(() => model.value?.split(":")[0] ?? "09");
const selectedMinute = computed(() => model.value?.split(":")[1] ?? "00");

function updateHour(value: AcceptableValue) {
  model.value = `${String(value)}:${selectedMinute.value}`;
}

function updateMinute(value: AcceptableValue) {
  model.value = `${selectedHour.value}:${String(value)}`;
}
```

Delete the `<i18n lang="yaml">…</i18n>` block at the end of the file.

**Step 5b: Note the accepted behavior change**

This step is documentation only, no file changes beyond what Step 3–5 already produced. Before
moving on, re-read the "Accepted behavior change" bullet in this plan's intro — it describes exactly
what Steps 3–5 just did to `UiInputPassword`, `UiTextarea`, `UiTimePicker` and why existing call
sites in `apps/haex-mail` and `apps/haex-calendar` are intentionally left unchanged.

**Step 6: Verify no i18n is left**

Run: `grep -rnE "useI18n|<i18n|\\\$t\(|@nuxtjs/i18n" packages/haex-ui --include=*.vue --include=*.ts --include=*.json -l | grep -v node_modules`
Expected: no output.

**Step 7: Verify the layer generates types without the module**

Run: `cd packages/haex-ui && rm -rf .nuxt && pnpm exec nuxi prepare && ls .nuxt | grep -c i18n; cd ../..`
Expected: `Types generated in .nuxt.` and the count is `0` (the baseline had `i18n-route-resources.mjs`).

**Step 8: Verify an app that brings its own i18n still builds**

Run: `pnpm --filter haex-calendar exec nuxt prepare && pnpm --filter haex-calendar build 2>&1 | tail -5`
Expected: build ends with a Nitro "You can preview this build" or "✔ … built" line and no `ERROR`. (CI builds haex-calendar and haex-code for `packages/**` changes; haex-code does not use the three changed components, so one local build suffices and the PR run covers the other.) If the build fails on something unrelated to i18n or the three components, stop and report; do not fix app code in this plan.

**Step 9: Commit**

```bash
git add packages/haex-ui/nuxt.config.ts packages/haex-ui/package.json packages/haex-ui/components/ui
git commit -m "feat(haex-ui): drop the forced i18n module; labels become props"
```

---

### Task 4: Add toggle-group, table, number-field

**Files:**
- Create (via CLI): `packages/haex-ui/components/shadcn/{toggle,toggle-group,table,number-field}/**`

**Step 1: Generate**

Run (from the worktree root):
```bash
cd packages/haex-ui && pnpm dlx shadcn-vue@2.8.2 add toggle-group table number-field --yes; cd ../..
```
Expected: the CLI prints the created files, exit code 0, no prompts. (`toggle` is pulled in as a dependency of `toggle-group`.)

**Step 2: Verify only the four directories changed**

Run: `git status --porcelain`
Expected exactly:
```
?? packages/haex-ui/components/shadcn/number-field/
?? packages/haex-ui/components/shadcn/table/
?? packages/haex-ui/components/shadcn/toggle-group/
?? packages/haex-ui/components/shadcn/toggle/
```
If `package.json`, `components.json` or `assets/` show up as modified, inspect the diff and revert anything that is not needed (the CLI probe on 2026-09-17 touched none of them).

**Step 3: Verify the component names Nuxt derives**

Run: `cd packages/haex-ui && pnpm exec nuxi prepare && grep -oE "Shadcn(ToggleGroup|ToggleGroupItem|Toggle|Table|TableRow|TableHead|TableCell|NumberField|NumberFieldInput|NumberFieldIncrement|NumberFieldDecrement)\b" .nuxt/components.d.ts | sort -u; cd ../..`
Expected: all eleven names listed once each. (Nuxt strips the repeated path segment, so `toggle-group/ToggleGroupItem.vue` becomes `ShadcnToggleGroupItem`, same as the existing `sheet/SheetContent.vue`. Note: this Nuxt version emits `.nuxt/components.d.ts` as unquoted `export const ShadcnX: typeof import(...)`, not quoted string literals — the pattern above has no surrounding quotes for that reason; a quoted pattern silently matches nothing and gives a false "not generated" signal.)

**Step 3b: Fix the icon import**

`packages/haex-ui/components.json` has `"iconLibrary": "lucide"`, which makes the shadcn-vue CLI emit `import { X } from "lucide-vue-next"` in any generated component that uses an icon — but this monorepo migrated off `lucide-vue-next` to `@lucide/vue` (commit `dfdf944`), and `lucide-vue-next` is not a dependency anywhere here. `number-field` is the only one of the three components with icons (`NumberFieldIncrement.vue`, `NumberFieldDecrement.vue`).

Run: `grep -rln "lucide-vue-next" packages/haex-ui/components/shadcn/{toggle,toggle-group,table,number-field}`
Expected: `packages/haex-ui/components/shadcn/number-field/NumberFieldIncrement.vue` and `.../NumberFieldDecrement.vue`.

Fix: `sed -i 's/from "lucide-vue-next"/from "@lucide\/vue"/' packages/haex-ui/components/shadcn/number-field/NumberFieldIncrement.vue packages/haex-ui/components/shadcn/number-field/NumberFieldDecrement.vue`

Run: `grep -rl "lucide-vue-next" packages/haex-ui/components/shadcn/{toggle,toggle-group,table,number-field}`
Expected: no output.

(This is a standing gap in `components.json`, not something to fix in this task: every future `shadcn-vue add` of an icon-using component will reproduce it. Fixing `iconLibrary` itself is out of scope here — flag it to Martin as a follow-up, don't change `components.json`.)

**Step 4: Commit**

```bash
git add packages/haex-ui/components/shadcn
git commit -m "feat(haex-ui): add toggle-group, table and number-field"
```

---

### Task 5: Release workflow

**Files:**
- Create: `.github/workflows/ui-release.yml`

**Step 1: Create the workflow**

```yaml
name: UI Layer Release

on:
  push:
    tags:
      - 'ui-v*'
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to publish (must equal packages/haex-ui/package.json version, e.g. 0.1.0)'
        required: true
        type: string

permissions:
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
          registry-url: 'https://registry.npmjs.org'

      - name: Check tag matches package version
        env:
          INPUT_VERSION: ${{ github.event.inputs.version }}
          GIT_REF: ${{ github.ref }}
        run: |
          if [ -n "$INPUT_VERSION" ]; then
            EXPECTED="$INPUT_VERSION"
          else
            EXPECTED="${GIT_REF#refs/tags/ui-v}"
          fi
          ACTUAL=$(node -p "require('./packages/haex-ui/package.json').version")
          if [ "$EXPECTED" != "$ACTUAL" ]; then
            echo "Tag/input version $EXPECTED does not match package.json version $ACTUAL" >&2
            exit 1
          fi

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Publish @haex-space/ui
        working-directory: packages/haex-ui
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: pnpm publish --access public --no-git-checks
```

**Step 2: Verify YAML parses and the tag pattern is exclusive**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ui-release.yml')); print('yaml ok')"`
Expected: `yaml ok`

Run: `grep -n "haex-\*-v\*" .github/workflows/extension-release.yml`
Expected: the existing extension pattern `haex-*-v*`, which does not match `ui-v*` (so an `ui-v0.1.0` tag triggers only the new workflow).

**Step 3: Dry-run the publish locally (no auth needed for --dry-run)**

Run: `cd packages/haex-ui && pnpm publish --dry-run --no-git-checks 2>&1 | tail -8; cd ../..`
Expected: `Tarball Contents` listing matching Task 2 Step 5, total files ≈ 230 (35 shadcn dirs + 4 new + ui + lib/plugins/assets), no `ERR_PNPM`. If it complains about auth, that is fine for a dry run only if the tarball contents were printed.

**Step 4: Commit**

```bash
git add .github/workflows/ui-release.yml
git commit -m "ci: publish @haex-space/ui on ui-v* tags"
```

---

### Task 6: External consumer smoke test (Nuxt 3.21, like ifa-board)

This task proves the consumer contract from the design doc against the packed tarball. It writes only to the scratch directory; nothing in the repo changes.

**Step 1: Pack**

Run: `cd packages/haex-ui && npm pack --pack-destination /tmp 2>&1 | tail -1; cd ../..`
Expected: `haex-space-ui-0.1.0.tgz`

**Step 2: Scaffold the scratch consumer**

```bash
S=/tmp/ui-consumer-probe && rm -rf "$S" && mkdir -p "$S/assets/css" && cd "$S"
printf '{"name":"ui-consumer-probe","private":true,"type":"module"}\n' > package.json
pnpm add /tmp/haex-space-ui-0.1.0.tgz nuxt@^3.21 vue@^3.5 reka-ui @lucide/vue vue-sonner vaul-vue \
  embla-carousel-vue class-variance-authority clsx tailwind-merge@^3 @internationalized/date \
  @vueuse/core@^14 tailwindcss@^4 @tailwindcss/vite@^4 tw-animate-css --config.strict-peer-dependencies=false
```
Expected: install finishes; peer warnings about `nuxt ^4.2.2` are acceptable.

**Step 3: Write the consumer files**

`nuxt.config.ts`:
```ts
import tailwindcss from '@tailwindcss/vite'
export default defineNuxtConfig({
  compatibilityDate: '2025-09-01',
  extends: ['@haex-space/ui'],
  build: { transpile: ['reka-ui'] },
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
})
```

`assets/css/main.css`:
```css
@import "tailwindcss";
@import "tw-animate-css";
@import "@haex-space/ui/assets/css/theme.css";
@source "../../node_modules/@haex-space/ui/components";
@custom-variant dark (&:is(.dark *));
:root { --primary: oklch(0.55 0.17 145); }
@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground; }
}
```

`app.vue`:
```vue
<script setup lang="ts">
const value = ref('3')
</script>
<template>
  <main class="p-6 space-y-4">
    <ShadcnButton>Speichern</ShadcnButton>
    <ShadcnToggleGroup v-model="value" type="single" variant="outline">
      <ShadcnToggleGroupItem v-for="n in ['0','1','2','3','4','5']" :key="n" :value="n">{{ n }}</ShadcnToggleGroupItem>
    </ShadcnToggleGroup>
    <ShadcnNumberField :default-value="2" :min="0" :max="10">
      <ShadcnNumberFieldContent>
        <ShadcnNumberFieldDecrement />
        <ShadcnNumberFieldInput />
        <ShadcnNumberFieldIncrement />
      </ShadcnNumberFieldContent>
    </ShadcnNumberField>
    <UiInputPassword model-value="secret" copyable />
  </main>
</template>
```

**Step 4: Build and assert**

Run: `pnpm exec nuxi build 2>&1 | tail -4`
Expected: `✔ Nuxt Nitro server built` (or the equivalent success line), no `ERROR`.

Run: `grep -l "color-primary" .output/public/_nuxt/*.css | head -1 && grep -c "data-\[state=on\]" .output/public/_nuxt/*.css | grep -v ":0" | head -1`
Expected: a CSS file path on the first line (theme tokens present) and a non-zero count on the second (toggle-group classes were generated from the `@source` scan).

Run: `grep -rlE "Passwort anzeigen" .output/public/_nuxt/ | head -1`
Expected: one JS chunk path (German default label shipped, no i18n needed).

**Step 5: Record**

Append the three command outputs (trimmed) to the PR description in Task 7. Then `rm -rf /tmp/ui-consumer-probe /tmp/haex-space-ui-0.1.0.tgz`.

---

### Task 7: Push, PR, knowledge base

**Step 1: Knowledge base (local, gitignored)**

The knowledge base lives only in the main checkout (`.claude/` is gitignored and therefore absent from the worktree). Append to `/home/haex/Projekte/haextension/.claude/session-log.md` a dated entry: what changed, the new tag scheme `ui-v*`, the `NPM_TOKEN` prerequisite, the consumer contract pointer. Add a subsection "haex-ui (npm)" under "CI/CD Release Pipelines" in `/home/haex/Projekte/haextension/.claude/architecture.md` with trigger, steps and secret, mirroring the existing entries. Do not create a `.claude/` directory inside the worktree.

**Step 2: Push and open the PR**

```bash
gh auth switch --user haexhub
git push -u origin feat/ui-npm-release
gh pr create --title "feat(haex-ui): publish as @haex-space/ui, drop forced i18n, add toggle-group/table/number-field" --body-file <(cat <<'PR'
## Why
The layer was only reachable by path or giget; consumers copied the theme and globbed `.c12`. It also forced `@nuxtjs/i18n` on every consumer for six strings. Design: docs/plans/2026-09-17-ui-layer-npm-release-design.md.

## What
- Rename `@haex/ui` → `@haex-space/ui`, publish metadata, README with the consumer contract.
- Remove `@nuxtjs/i18n` from the layer; `UiInputPassword`, `UiTextarea`, `UiTimePicker` take `labels` props (German defaults). All apps already configure i18n themselves.
- Add shadcn `toggle-group` (+`toggle`), `table`, `number-field`.
- `ui-release.yml`: publish on `ui-v*` tags, guarded by a tag/version check.

## Verification
- `nuxi prepare` in the layer without i18n artifacts; haex-calendar builds.
- `npm pack --dry-run` contents reviewed.
- External Nuxt 3.21 consumer built from the tarball: theme tokens and toggle-group classes present, German labels shipped. (Outputs below.)

## Before the first release
- [ ] Repo secret `NPM_TOKEN` (publish rights on `@haex-space`)
- [ ] Confirm license `ISC`
- [ ] Merge, then `git tag ui-v0.1.0 && git push origin ui-v0.1.0`
PR
)
```

**Step 3: Report** the PR URL, the CI status of `extension-build.yml` on the PR, and the two open checkboxes.

---

### Out of scope (do not do in this plan)
- Migrating `holzi` or the monorepo apps to the npm package.
- Automating the version bump in `scripts/release.js`.
- Any change under `apps/**` except the one-line rename in `haex-pass-browser/package.json`.
