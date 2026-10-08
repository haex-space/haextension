import { eq } from "drizzle-orm";
import PhotoSwipeLightbox from "photoswipe/lightbox";
import "photoswipe/style.css";
import type { ComputedRef } from "vue";
import { haexPasswordsBinaries } from "~/database";
import {
  getFileType,
  isImage,
  createDataUrl,
  type FileType,
} from "~/utils/fileTypes";

interface HistoryAttachment {
  id: string;
  itemId: string;
  fileName: string;
  binaryHash: string;
  size?: number;
  dataUrl?: string;
}

export function useHistoryAttachments(
  props: { readonly itemId: string },
  parsedSnapshotData: ComputedRef<{
    attachments?: Array<{ fileName: string; binaryHash: string }>;
  } | null>,
  t: (key: string) => string
) {
  const haexVaultStore = useHaexVaultStore();
  const { orm } = storeToRefs(haexVaultStore);
  const client = haexVaultStore.client;

  const historyAttachments = ref<HistoryAttachment[]>([]);

  // Viewer state
  const viewerState = reactive<{
    open: boolean;
    attachment: HistoryAttachment | null;
    fileType: FileType | null;
    dataUrl: string | null;
  }>({
    open: false,
    attachment: null,
    fileType: null,
    dataUrl: null,
  });

  // Load attachments when snapshot changes
  watch(
    parsedSnapshotData,
    async (data) => {
      if (!data?.attachments?.length || !orm.value) {
        historyAttachments.value = [];
        return;
      }

      console.log(
        "[History] Loading attachments:",
        data.attachments?.length,
        "attachments"
      );
      console.log("[History] Attachment details:", data.attachments);

      // Load binary data for each attachment
      const loadedAttachments = await Promise.all(
        data.attachments.map(async (att, index) => {
          console.log(
            `[History] Loading attachment ${index + 1}/${
              data.attachments?.length
            }:`,
            att.fileName,
            "hash:",
            att.binaryHash
          );

          try {
            const result = await orm.value
              ?.select()
              .from(haexPasswordsBinaries)
              .where(eq(haexPasswordsBinaries.hash, att.binaryHash))
              .limit(1);

            console.log(
              `[History] Database result for ${att.fileName}:`,
              result?.length ? "found" : "NOT FOUND"
            );

            if (!result?.length || !result[0]?.data) {
              console.warn(
                `[History] No data found for attachment ${att.fileName}`
              );
              return {
                id: att.binaryHash,
                itemId: props.itemId,
                fileName: att.fileName,
                binaryHash: att.binaryHash,
                dataUrl: undefined,
                size: undefined,
              };
            }

            const binary = result[0];
            const base64Data = binary.data;

            console.log(
              `[History] Binary data length for ${att.fileName}:`,
              base64Data?.length || 0,
              "bytes, size:",
              binary.size
            );

            const fileType = getFileType(att.fileName);

            // Create data URL for images, PDFs, and text files (needed for viewer)
            if (
              fileType === "image" ||
              fileType === "pdf" ||
              fileType === "text"
            ) {
              const dataUrl = createDataUrl(base64Data, att.fileName);
              console.log(
                `[History] Created data URL for ${fileType} ${att.fileName}`
              );

              return {
                id: att.binaryHash,
                itemId: props.itemId,
                fileName: att.fileName,
                binaryHash: att.binaryHash,
                dataUrl,
                size: binary.size ?? undefined,
              };
            }

            console.log(
              `[History] Other file type ${att.fileName}, type:`,
              fileType
            );
            return {
              id: att.binaryHash,
              itemId: props.itemId,
              fileName: att.fileName,
              binaryHash: att.binaryHash,
              dataUrl: undefined,
              size: binary.size ?? undefined,
            };
          } catch (error) {
            console.error(
              `[History] Error loading attachment ${att.fileName}:`,
              error
            );
            return {
              id: att.binaryHash,
              itemId: props.itemId,
              fileName: att.fileName,
              binaryHash: att.binaryHash,
              dataUrl: undefined,
              size: undefined,
            };
          }
        })
      );

      console.log("[History] All attachments loaded:", loadedAttachments.length);
      console.log(
        "[History] Loaded attachment details:",
        loadedAttachments.map((a) => ({
          fileName: a.fileName,
          hasDataUrl: !!a.dataUrl,
          size: a.size,
        }))
      );

      historyAttachments.value = loadedAttachments;
    },
    { immediate: true }
  );

  // Open viewer based on file type
  function openViewer(attachment: HistoryAttachment) {
    const fileType = getFileType(attachment.fileName);

    // For images, use PhotoSwipe gallery
    if (fileType === "image") {
      openGallery(attachment);
      return;
    }

    // For PDF and text, use the viewer dialog
    if (fileType === "pdf" || fileType === "text") {
      if (!attachment.dataUrl) return;

      viewerState.attachment = attachment;
      viewerState.fileType = fileType;
      viewerState.dataUrl = attachment.dataUrl;
      viewerState.open = true;
      return;
    }

    // For other types, do nothing (user can still download)
  }

  // Open PhotoSwipe gallery
  async function openGallery(attachment: HistoryAttachment) {
    const images = historyAttachments.value.filter((a) => isImage(a.fileName));
    const imageIndex = images.findIndex(
      (img) => img.binaryHash === attachment.binaryHash
    );

    if (imageIndex === -1) return;

    // Load images and get their actual dimensions
    const items = await Promise.all(
      images.map(async (img) => {
        const src = img.dataUrl || "";

        // Load image to get actual dimensions
        const dimensions = await new Promise<{ width: number; height: number }>(
          (resolve) => {
            const image = new Image();
            image.onload = () => {
              resolve({ width: image.naturalWidth, height: image.naturalHeight });
            };
            image.onerror = () => {
              // Fallback dimensions if image fails to load
              resolve({ width: 1920, height: 1080 });
            };
            image.src = src;
          }
        );

        return {
          src,
          width: dimensions.width,
          height: dimensions.height,
          alt: img.fileName,
        };
      })
    );

    const lightbox = new PhotoSwipeLightbox({
      dataSource: items,
      pswpModule: () => import("photoswipe"),
      index: imageIndex,
      showHideAnimationType: "zoom",
      preload: [1, 2],
    });

    lightbox.init();
    lightbox.loadAndOpen(imageIndex);
  }

  // Download attachment
  async function downloadAttachment(attachment: HistoryAttachment) {
    if (!client || !orm.value) {
      console.error("[History] Download - HaexHub client or ORM not available");
      return;
    }

    try {
      // Query the database for binary data
      const result = await orm.value
        .select()
        .from(haexPasswordsBinaries)
        .where(eq(haexPasswordsBinaries.hash, attachment.binaryHash))
        .limit(1);

      if (!result.length || !result[0]?.data) {
        console.error("[History] Download - Binary not found in database");
        return;
      }

      const base64Data = result[0].data;

      // Convert base64 to Uint8Array
      const base64Content = base64Data.split(",")[1] || base64Data;
      const binaryString = atob(base64Content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Use HaexHub Filesystem API to save file
      const saveResult = await client.filesystem.saveFileAsync(bytes, {
        defaultPath: attachment.fileName,
        title: t("saveFile"),
      });

      if (!saveResult) {
        // User cancelled
        return;
      }

      console.log("[History] Download - File saved successfully");
    } catch (error) {
      console.error("[History] Download error:", error);
    }
  }

  return {
    historyAttachments,
    viewerState,
    openViewer,
    downloadAttachment,
  };
}
