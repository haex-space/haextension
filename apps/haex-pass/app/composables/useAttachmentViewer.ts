import PhotoSwipeLightbox from "photoswipe/lightbox";
import "photoswipe/style.css";
import { eq } from "drizzle-orm";
import type { Ref } from "vue";
import { haexPasswordsBinaries } from "~/database";
import { getFileType, isImage, type FileType } from "~/utils/fileTypes";
import type { AttachmentWithSize } from "~/types/attachment";

// Type guard to check if attachment has data (new attachment)
function isNewAttachment(attachment: AttachmentWithSize): boolean {
  return "data" in attachment && typeof attachment.data === "string";
}

export function useAttachmentViewer(
  attachments: Ref<AttachmentWithSize[]>,
  attachmentsToAdd: Ref<AttachmentWithSize[]>,
  t: (key: string) => string
) {
  const haexVaultStore = useHaexVaultStore();
  const { orm } = storeToRefs(haexVaultStore);
  const client = haexVaultStore.client;

  // Viewer state
  const viewerState = reactive<{
    open: boolean;
    attachment: AttachmentWithSize | null;
    fileType: FileType | null;
    dataUrl: string | null;
  }>({
    open: false,
    attachment: null,
    fileType: null,
    dataUrl: null,
  });

  // Get attachment data
  function getAttachmentData(attachment: AttachmentWithSize): string | undefined {
    // Check if this is a new attachment with data
    if (!isNewAttachment(attachment) || !attachment.data) {
      return undefined;
    }

    // Create data URL with appropriate MIME type
    return createDataUrl(attachment.data, attachment.fileName);
  }

  // Open viewer based on file type
  function openViewer(attachment: AttachmentWithSize) {
    const fileType = getFileType(attachment.fileName);

    // For images, use PhotoSwipe gallery
    if (fileType === "image") {
      openGallery(attachment);
      return;
    }

    // For PDF and text, use the viewer dialog
    if (fileType === "pdf" || fileType === "text") {
      const dataUrl = getAttachmentData(attachment);
      if (!dataUrl) return;

      viewerState.attachment = attachment;
      viewerState.fileType = fileType;
      viewerState.dataUrl = dataUrl;
      viewerState.open = true;
      return;
    }

    // For other types, do nothing (user can still download)
  }

  // Open PhotoSwipe gallery
  async function openGallery(attachment: AttachmentWithSize) {
    // Combine all attachments (existing + new)
    const allAttachments = [...attachments.value, ...attachmentsToAdd.value];
    const images = allAttachments.filter((a) => isImage(a.fileName));
    const imageIndex = images.findIndex((img) => img.id === attachment.id);

    if (imageIndex === -1) return;

    // Load images and get their actual dimensions
    const items = await Promise.all(
      images.map(async (img) => {
        const src = getAttachmentData(img) || "";

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
  async function downloadAttachment(attachment: AttachmentWithSize) {
    if (!client) {
      console.error("[Attachments] Download - HaexHub client not available");
      return;
    }

    console.log("[Attachments] Download - attachment:", attachment);
    console.log("[Attachments] Download - binaryHash:", attachment.binaryHash);

    try {
      let base64Data: string;

      // Check if this is a new attachment (has data property) or existing (needs DB lookup)
      if (isNewAttachment(attachment) && attachment.data) {
        // New attachment - use the data directly
        base64Data = attachment.data;
        console.log("[Attachments] Download - Using data from new attachment");
      } else if (attachment.binaryHash && orm.value) {
        // Existing attachment - query the database
        const result = await orm.value
          .select()
          .from(haexPasswordsBinaries)
          .where(eq(haexPasswordsBinaries.hash, attachment.binaryHash))
          .limit(1);

        console.log("[Attachments] Download - query result:", result);
        console.log("[Attachments] Download - result length:", result.length);
        console.log(
          "[Attachments] Download - has data:",
          result[0]?.data ? "yes" : "no"
        );

        if (!result.length || !result[0]?.data) {
          console.error("[Attachments] Download - Binary not found in database");
          return;
        }

        base64Data = result[0].data;
      } else {
        console.error(
          "[Attachments] Download - No data available for attachment"
        );
        return;
      }

      // Convert base64 to Uint8Array
      console.log(
        "[Attachments] Download - base64Data length:",
        base64Data.length
      );
      console.log(
        "[Attachments] Download - base64Data starts with:",
        base64Data.substring(0, 50)
      );

      const base64Content = base64Data.split(",")[1] || base64Data;
      console.log(
        "[Attachments] Download - base64Content length:",
        base64Content.length
      );
      console.log(
        "[Attachments] Download - base64Content starts with:",
        base64Content.substring(0, 50)
      );

      const binaryString = atob(base64Content);
      console.log(
        "[Attachments] Download - binaryString length:",
        binaryString.length
      );

      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      console.log("[Attachments] Download - bytes length:", bytes.length);
      console.log(
        "[Attachments] Download - bytes first 10:",
        Array.from(bytes.slice(0, 10))
      );

      // Use HaexHub Filesystem API to save file
      console.log(
        "[Attachments] Download - Calling saveFileAsync with",
        bytes.length,
        "bytes"
      );
      const saveResult = await client.filesystem.saveFileAsync(bytes, {
        defaultPath: attachment.fileName,
        title: t("saveFile"),
      });

      console.log("[Attachments] Download - saveResult:", saveResult);

      if (!saveResult) {
        // User cancelled
        return;
      }

      console.log("[Attachments] Download - File saved successfully");
    } catch (error) {
      console.error("[Attachments] Download error:", error);
    }
  }

  return {
    viewerState,
    getAttachmentData,
    openViewer,
    downloadAttachment,
  };
}
