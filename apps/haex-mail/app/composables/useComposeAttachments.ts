import { ref, type Ref } from "vue";
import type { OutgoingAttachment } from "@haex-space/vault-sdk";
import { getErrorMessage } from "../lib/utils";

/** The attachments of the compose dialog: picked, dropped or pasted files as base64. */
export const useComposeAttachments = (attachments: Ref<OutgoingAttachment[]>, error: Ref<string | null>) => {
  const fileInput = ref<HTMLInputElement>();

  /** Approximate decoded byte size of a base64 payload (for display). */
  const attachmentBytes = (data: string) => Math.floor((data.length * 3) / 4);

  const formatSize = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`);

  const removeAttachment = (index: number) => {
    attachments.value.splice(index, 1);
  };

  /** Reads a File as base64 (no `data:` URL prefix — SDK expects raw base64). */
  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.slice(result.indexOf(",") + 1));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  /** Adds files as attachments: from the picker, or dropped / pasted into the editor. */
  const addFilesAsync = async (files: File[]) => {
    try {
      for (const file of files) {
        attachments.value.push({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          data: await fileToBase64(file),
        });
      }
    } catch (err) {
      error.value = getErrorMessage(err);
    }
  };

  const onFilesPicked = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    try {
      await addFilesAsync(Array.from(target.files ?? []));
    } finally {
      target.value = "";
    }
  };

  return { fileInput, attachmentBytes, formatSize, removeAttachment, addFilesAsync, onFilesPicked };
};
