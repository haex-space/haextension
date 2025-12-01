<template>
  <UiBreadcrumb class="px-7 py-4">
    <div class="flex items-center justify-between w-full min-h-[32px]">
      <UiBreadcrumbList>
        <UiBreadcrumbItem>
          <UiBreadcrumbLink as-child>
            <NuxtLinkLocale
              :to="{ name: 'passwordGroupItems' }"
              class="flex items-center"
            >
              <Icon name="mdi:safe" size="20" />
            </NuxtLinkLocale>
          </UiBreadcrumbLink>
        </UiBreadcrumbItem>

        <template v-for="(item, index) in items ?? []" :key="item.id">
          <UiBreadcrumbSeparator>
            <ChevronRight class="w-4 h-4" />
          </UiBreadcrumbSeparator>

          <UiBreadcrumbItem>
            <UiBreadcrumbLink v-if="index < (items?.length ?? 0) - 1" as-child>
              <NuxtLinkLocale
                :to="{
                  name: 'passwordGroupItems',
                  params: { groupId: item.id },
                }"
              >
                {{ item.name }}
              </NuxtLinkLocale>
            </UiBreadcrumbLink>
            <UiBreadcrumbPage v-else>
              {{ item.name }}
            </UiBreadcrumbPage>
          </UiBreadcrumbItem>
        </template>

        <template v-if="lastGroup">
          <UiBreadcrumbSeparator />
          <UiBreadcrumbItem>
            <UiBreadcrumbLink as-child>
              <NuxtLinkLocale
                :to="{
                  name: 'passwordGroupEdit',
                  params: { groupId: lastGroup.id },
                }"
                :title="t('edit')"
              >
                <Pencil class="w-4 h-4" />
              </NuxtLinkLocale>
            </UiBreadcrumbLink>
          </UiBreadcrumbItem>
        </template>
      </UiBreadcrumbList>

      <!-- Clipboard actions - visible when clipboard has items -->
      <UiButtonGroup v-if="selectionStore.hasClipboardItems">
        <UiButton
          variant="secondary"
          size="sm"
          @click="selectionStore.clearClipboard()"
        >
          {{
            t("clipboardCount", { count: selectionStore.clipboardItems.length })
          }}
        </UiButton>
        <UiButton
          :icon="ClipboardPaste"
          :tooltip="t('paste')"
          variant="default"
          size="sm"
          @click="$emit('paste')"
        />
      </UiButtonGroup>
    </div>
  </UiBreadcrumb>
</template>

<script setup lang="ts">
import type { SelectHaexPasswordsGroups } from "~/database";
import { ChevronRight, Pencil, ClipboardPaste } from "lucide-vue-next";

const props = defineProps<{ items?: SelectHaexPasswordsGroups[] }>();

const lastGroup = computed(() => props.items?.at(-1));
const selectionStore = useSelectionStore();

const { t } = useI18n();

defineEmits<{
  paste: [];
}>();
</script>

<i18n lang="yaml">
de:
  edit: Bearbeiten
  paste: Einfügen
  clipboardCount: "x {count}"

en:
  edit: Edit
  paste: Paste
  clipboardCount: "x {count}"
</i18n>
