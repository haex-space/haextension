import { arrayBufferToBase64, addBinaryAsync } from "~/utils/cleanup";

/**
 * Composable for downloading and managing favicons
 */
export const useFavicon = () => {
  const haexVaultStore = useHaexVaultStore();
  const { loadCustomIconsAsync } = useCustomIcons();

  /**
   * Downloads a favicon for a given URL and saves it to the database
   * @param url The URL to fetch the favicon from
   * @returns The icon identifier (binary:hash) or null if failed
   */
  const downloadFaviconAsync = async (url: string): Promise<string | null> => {
    if (!haexVaultStore.client || !haexVaultStore.orm) {
      console.error("[Favicon] HaexHub client or ORM not available");
      return null;
    }

    // Extract domain from URL
    let domain: string;
    try {
      const parsedUrl = new URL(url);
      domain = parsedUrl.hostname;
    } catch {
      console.error("[Favicon] Invalid URL format:", url);
      return null;
    }

    // Use DuckDuckGo's icon service
    const faviconUrl = `https://icons.duckduckgo.com/ip3/${domain}.ico`;

    try {
      const response = await haexVaultStore.client.web.fetchAsync(faviconUrl);

      if (response.status >= 200 && response.status < 300 && response.body) {
        const base64 = arrayBufferToBase64(response.body);
        const hash = await addBinaryAsync(
          haexVaultStore.orm,
          base64,
          response.body.byteLength,
          "icon"
        );

        // Reload custom icons list so it appears immediately
        await loadCustomIconsAsync();

        return `binary:${hash}`;
      }

      return null;
    } catch (error) {
      console.error("[Favicon] Failed to fetch favicon:", error);
      return null;
    }
  };

  /**
   * Downloads favicon for an item and updates its icon
   * @param itemId The item ID to update
   * @param url The URL to fetch the favicon from
   * @returns true if successful, false otherwise
   */
  const downloadAndSetFaviconAsync = async (
    itemId: string,
    url: string
  ): Promise<boolean> => {
    const iconName = await downloadFaviconAsync(url);
    if (!iconName) return false;

    const { updateAsync, readAsync } = usePasswordItemStore();

    // Read current item details
    const item = await readAsync(itemId);
    if (!item) return false;

    // Update item with new icon
    await updateAsync({
      details: { ...item.details, icon: iconName },
      keyValues: item.keyValues,
      keyValuesAdd: [],
      keyValuesDelete: [],
    });

    return true;
  };

  return {
    downloadFaviconAsync,
    downloadAndSetFaviconAsync,
  };
};
