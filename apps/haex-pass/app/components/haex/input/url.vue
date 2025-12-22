<template>
  <div class="space-y-2">
    <ShadcnLabel>{{ t("url") }}</ShadcnLabel>

    <UiInput
      v-model.trim="model"
      type="url"
      :placeholder="t('url')"
      :readonly="readonly"
      v-bind="$attrs"
    >
      <template #append>
        <UiButton
          v-if="!readonly"
          :icon="isLoadingFavicon ? Loader2 : Image"
          :tooltip="t('favicon.fetch')"
          variant="ghost"
          :disabled="!model?.length || isLoadingFavicon"
          :class="{ 'animate-spin': isLoadingFavicon }"
          @click.prevent="fetchFaviconAsync"
        />
        <UiButton
          :icon="ExternalLink"
          :tooltip="t('open')"
          variant="ghost"
          :disabled="!model?.length"
          @click.prevent="openUrl"
        />
        <UiButton
          :icon="copied ? Check : Copy"
          :tooltip="copied ? t('copied') : t('copy')"
          variant="ghost"
          @click.prevent="handleCopy"
        />
      </template>
    </UiInput>
  </div>
</template>

<script setup lang="ts">
import { useClipboard } from "@vueuse/core";
import { Copy, Check, ExternalLink, Image, Loader2 } from "lucide-vue-next";
import { arrayBufferToBase64, addBinaryAsync } from "~/utils/cleanup";
import { toast } from "vue-sonner";

const model = defineModel<string | null>();

defineProps<{
  readonly?: boolean;
}>();

const emit = defineEmits<{
  faviconFetched: [iconName: string];
}>();

const { t } = useI18n();
const { copy, copied } = useClipboard();
const { loadCustomIconsAsync } = useCustomIcons();
const isLoadingFavicon = ref(false);

const handleCopy = async () => {
  if (model.value) {
    await copy(model.value);
  }
};

const openUrl = async () => {
  if (!model.value) return;

  const haexVaultStore = useHaexVaultStore();
  if (!haexVaultStore.client) {
    console.error("[URL] HaexHub client not available");
    return;
  }

  try {
    await haexVaultStore.client.web.openAsync(model.value);
  } catch (error) {
    // Method not implemented yet in host application
    console.log("[URL] web.openAsync not available, URL:", model.value, error);
  }
};

const fetchFaviconAsync = async () => {
  if (!model.value) return;

  const haexVaultStore = useHaexVaultStore();
  if (!haexVaultStore.client || !haexVaultStore.orm) {
    console.error("[FaviconFetch] HaexHub client or ORM not available");
    return;
  }

  try {
    isLoadingFavicon.value = true;

    // Extract domain from URL
    let domain: string;
    try {
      const url = new URL(model.value);
      domain = url.hostname;
    } catch (urlError) {
      // Invalid URL format
      toast.error(t("favicon.invalidUrl"));
      console.error(urlError);
      return;
    }

    // Use DuckDuckGo's icon service - it's reliable and doesn't require per-domain permissions
    const faviconUrl = `https://icons.duckduckgo.com/ip3/${domain}.ico`;

    try {
      const response = await haexVaultStore.client.web.fetchAsync(faviconUrl);

      // Check if response is successful (status 200-299) and has content
      if (response.status >= 200 && response.status < 300 && response.body) {
        // Convert ArrayBuffer to base64 using utility function
        const base64 = arrayBufferToBase64(response.body);

        // Save to database as icon
        const hash = await addBinaryAsync(
          haexVaultStore.orm,
          base64,
          response.body.byteLength,
          "icon"
        );

        // Emit the binary hash as icon name
        emit("faviconFetched", `binary:${hash}`);
        console.log(
          "[FaviconFetch] Successfully saved favicon with hash:",
          hash
        );

        // Reload custom icons list so it appears immediately
        await loadCustomIconsAsync();

        // Show success toast
        toast.success(t("favicon.downloaded"));
        return;
      }
    } catch (error: any) {
      console.error("[FaviconFetch] Failed to fetch favicon:", error);

      // Show error toast with appropriate message
      const errorMessage =
        error?.code === 1002
          ? t("favicon.permissionError")
          : t("favicon.fetchError");

      toast.error(errorMessage);
    }
  } catch (error) {
    console.error("[FaviconFetch] Error:", error);

    // Show generic error toast
    toast.error(t("favicon.error"));
  } finally {
    isLoadingFavicon.value = false;
  }
};
</script>

<i18n lang="yaml">
de:
  url: URL
  open: URL öffnen
  copy: Kopieren
  copied: Kopiert!
  favicon:
    fetch: Favicon herunterladen
    downloaded: Favicon erfolgreich heruntergeladen
    permissionError: Keine Berechtigung für Favicon-Download. Bitte Extension neu laden.
    fetchError: Favicon konnte nicht heruntergeladen werden
    error: Fehler beim Favicon-Download
    invalidUrl: Ungültige URL. Bitte gib eine vollständige URL mit Protokoll ein (z.B. https://example.com)

en:
  url: URL
  open: Open URL
  copy: Copy
  copied: Copied!
  favicon:
    fetch: Download favicon
    downloaded: Favicon downloaded successfully
    permissionError: No permission for favicon download. Please reload extension.
    fetchError: Failed to download favicon
    error: Error downloading favicon
    invalidUrl: Invalid URL. Please enter a complete URL with protocol (e.g. https://example.com)
</i18n>
