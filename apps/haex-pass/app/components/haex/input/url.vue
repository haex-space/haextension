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
    toast.error(t("openUrl.error"));
    return;
  }

  // Validate URL format first
  try {
    const url = new URL(model.value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      toast.error(t("openUrl.invalidProtocol"));
      return;
    }
  } catch {
    toast.error(t("openUrl.invalidUrl"), {
      duration: 5000,
      description: t("openUrl.invalidUrlDescription"),
    });
    return;
  }

  try {
    await haexVaultStore.client.web.openAsync(model.value);
  } catch (error: unknown) {
    console.error("[URL] Failed to open URL:", error);
    const errorCode = (error as { code?: number })?.code;
    const errorMessage =
      errorCode === 1002
        ? t("openUrl.permissionError")
        : t("openUrl.error");
    toast.error(errorMessage);
  }
};

const fetchFaviconAsync = async () => {
  if (!model.value) return;

  const haexVaultStore = useHaexVaultStore();
  if (!haexVaultStore.client || !haexVaultStore.orm) {
    console.error("[FaviconFetch] HaexHub client or ORM not available");
    toast.error(t("favicon.error"));
    return;
  }

  // Extract domain from URL first (before setting loading state)
  let domain: string;
  try {
    const url = new URL(model.value);
    domain = url.hostname;
  } catch (urlError) {
    // Invalid URL format - show error and return early
    console.error("[FaviconFetch] Invalid URL format:", urlError);
    toast.error(t("favicon.invalidUrl"), {
      duration: 5000,
      description: t("favicon.invalidUrlDescription"),
    });
    return;
  }

  // Use DuckDuckGo's icon service - it's reliable and doesn't require per-domain permissions
  const faviconUrl = `https://icons.duckduckgo.com/ip3/${domain}.ico`;

  isLoadingFavicon.value = true;

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
    } else {
      // Response was not successful
      toast.error(t("favicon.fetchError"));
    }
  } catch (error: unknown) {
    console.error("[FaviconFetch] Failed to fetch favicon:", error);

    // Show error toast with appropriate message
    const errorCode = (error as { code?: number })?.code;
    const errorMessage =
      errorCode === 1002
        ? t("favicon.permissionError")
        : t("favicon.fetchError");

    toast.error(errorMessage);
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
  openUrl:
    error: URL konnte nicht geöffnet werden
    invalidUrl: Ungültige URL
    invalidUrlDescription: Bitte gib eine vollständige URL mit Protokoll ein (z.B. https://example.com)
    invalidProtocol: Nur http und https URLs werden unterstützt
    permissionError: Keine Berechtigung zum Öffnen dieser URL
  favicon:
    fetch: Favicon herunterladen
    downloaded: Favicon erfolgreich heruntergeladen
    permissionError: Keine Berechtigung für Favicon-Download. Bitte Extension neu laden.
    fetchError: Favicon konnte nicht heruntergeladen werden
    error: Fehler beim Favicon-Download
    invalidUrl: Ungültige URL
    invalidUrlDescription: Bitte gib eine vollständige URL mit Protokoll ein (z.B. https://example.com)

en:
  url: URL
  open: Open URL
  copy: Copy
  copied: Copied!
  openUrl:
    error: Failed to open URL
    invalidUrl: Invalid URL
    invalidUrlDescription: Please enter a complete URL with protocol (e.g. https://example.com)
    invalidProtocol: Only http and https URLs are supported
    permissionError: No permission to open this URL
  favicon:
    fetch: Download favicon
    downloaded: Favicon downloaded successfully
    permissionError: No permission for favicon download. Please reload extension.
    fetchError: Failed to download favicon
    error: Error downloading favicon
    invalidUrl: Invalid URL
    invalidUrlDescription: Please enter a complete URL with protocol (e.g. https://example.com)
</i18n>
