<template>
  <ShadcnBreadcrumb class="px-7 py-4">
    <div class="flex items-center justify-between w-full min-h-[32px]">
      <ShadcnBreadcrumbList>
        <ShadcnBreadcrumbItem>
          <ShadcnBreadcrumbLink as-child>
            <NuxtLinkLocale
              :to="{ name: 'passwordGroupItems' }"
              class="flex items-center"
            >
              <Icon name="mdi:safe" size="20" />
            </NuxtLinkLocale>
          </ShadcnBreadcrumbLink>
        </ShadcnBreadcrumbItem>

        <template v-for="(item, index) in items ?? []" :key="item.id">
          <ShadcnBreadcrumbSeparator>
            <ChevronRight class="w-4 h-4" />
          </ShadcnBreadcrumbSeparator>

          <ShadcnBreadcrumbItem>
            <ShadcnBreadcrumbLink v-if="index < (items?.length ?? 0) - 1" as-child>
              <NuxtLinkLocale
                :to="{
                  name: 'passwordGroupItems',
                  params: { groupId: item.id },
                }"
              >
                {{ item.name }}
              </NuxtLinkLocale>
            </ShadcnBreadcrumbLink>
            <ShadcnBreadcrumbPage v-else>
              {{ item.name }}
            </ShadcnBreadcrumbPage>
          </ShadcnBreadcrumbItem>
        </template>

        <template v-if="lastGroup">
          <ShadcnBreadcrumbSeparator />
          <ShadcnBreadcrumbItem>
            <ShadcnBreadcrumbLink as-child>
              <NuxtLinkLocale
                :to="{
                  name: 'passwordGroupEdit',
                  params: { groupId: lastGroup.id },
                }"
                :title="t('edit')"
              >
                <Pencil class="w-4 h-4" />
              </NuxtLinkLocale>
            </ShadcnBreadcrumbLink>
          </ShadcnBreadcrumbItem>
        </template>
      </ShadcnBreadcrumbList>

      <!-- Clipboard actions - visible when clipboard has items -->
      <ShadcnButtonGroup v-if="selectionStore.hasClipboardItems">
        <ShadcnButton
          variant="secondary"
          size="sm"
          @click="selectionStore.clearClipboard()"
        >
          {{
            t("clipboardCount", { count: selectionStore.clipboardItems.length })
          }}
        </ShadcnButton>
        <ShadcnButton
          :icon="ClipboardPaste"
          :tooltip="t('paste')"
          variant="default"
          size="sm"
          @click="$emit('paste')"
        />
      </ShadcnButtonGroup>
    </div>
  </ShadcnBreadcrumb>
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
