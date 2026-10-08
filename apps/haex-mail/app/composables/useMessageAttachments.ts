import { toast } from "vue-sonner";
import type { AttachmentJson } from "~/database/schemas";
import { getErrorMessage } from "~/lib/utils";

/** Attachments of the open message: open (inline pdf/image/txt) or download. */
export const useMessageAttachments = () => {
  const mailStore = useMailStore();
  const haexVault = useHaexVaultStore();

  /** The list row backing the open message — needed to fetch bytes by uid. */
  const currentRow = computed(
    () =>
      mailStore.messageList.find((m) => m.id === mailStore.selectedMessageId) ??
      null,
  );

  const base64ToBytes = (b64: string) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  };

  // Many servers label attachments as a generic octet-stream and leave the
  // real type implicit in the filename extension. Recover it so PDFs/images
  // show a meaningful type and can be viewed inline instead of only saved.
  const GENERIC_TYPES = new Set(["application/octet-stream", "binary/octet-stream", ""]);
  const EXT_TO_TYPE: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    txt: "text/plain",
    log: "text/plain",
    csv: "text/csv",
    md: "text/markdown",
  };
  const effectiveType = (att: AttachmentJson) => {
    if (!GENERIC_TYPES.has(att.contentType.toLowerCase())) return att.contentType;
    const ext = att.filename?.split(".").pop()?.toLowerCase();
    return (ext && EXT_TO_TYPE[ext]) || att.contentType;
  };

  // image and text render inline; pdf and everything else are handed to the
  // host to open with the system's default app (the sandboxed webview can't
  // embed them).
  type ViewerState =
    | { kind: "image"; url: string; filename: string }
    | { kind: "text"; text: string; filename: string };

  const viewer = ref<ViewerState | null>(null);
  // partIndex currently being fetched (drives the per-row spinner).
  const busyPart = ref<number | null>(null);
  // Bumped whenever a viewer is closed/invalidated; an in-flight open request
  // that resolves after its token is stale is discarded so it can't assign a
  // viewer after cleanup.
  let viewSeq = 0;

  const closeViewer = () => {
    viewSeq++;
    viewer.value = null;
  };

  const saveAttachmentAsync = async (att: AttachmentJson, b64: string) => {
    await haexVault.client.filesystem.saveFileAsync(base64ToBytes(b64), {
      defaultPath: att.filename ?? `attachment-${att.partIndex}`,
    });
  };

  const openAttachmentAsync = async (att: AttachmentJson) => {
    const row = currentRow.value;
    if (!row || busyPart.value !== null) return;
    const seq = ++viewSeq;
    busyPart.value = att.partIndex;
    try {
      const b64 = await mailStore.fetchAttachmentBase64Async(row, att.partIndex);
      // The message changed or the component unmounted while fetching — drop
      // this result rather than opening a stale viewer.
      if (seq !== viewSeq) return;
      const type = effectiveType(att);
      if (type.startsWith("image/")) {
        viewer.value = {
          kind: "image",
          url: `data:${type};base64,${b64}`,
          filename: att.filename ?? "",
        };
      } else if (type.startsWith("text/")) {
        viewer.value = {
          kind: "text",
          text: new TextDecoder().decode(base64ToBytes(b64)),
          filename: att.filename ?? "",
        };
      } else {
        // pdf and everything else: let the host open it with the system's
        // default application — the sandboxed webview can't embed it.
        await haexVault.client.filesystem.openFileAsync(base64ToBytes(b64), {
          fileName: att.filename ?? `attachment-${att.partIndex}`,
          mimeType: type,
        });
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      busyPart.value = null;
    }
  };

  const downloadAttachmentAsync = async (att: AttachmentJson) => {
    const row = currentRow.value;
    if (!row || busyPart.value !== null) return;
    busyPart.value = att.partIndex;
    try {
      const b64 = await mailStore.fetchAttachmentBase64Async(row, att.partIndex);
      await saveAttachmentAsync(att, b64);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      busyPart.value = null;
    }
  };

  // Dialog open-state binding: the primitive drives close via Escape,
  // outside-click and its built-in close button — all route through here.
  const onViewerOpenChange = (open: boolean) => {
    if (!open) closeViewer();
  };

  return {
    viewer,
    busyPart,
    closeViewer,
    effectiveType,
    openAttachmentAsync,
    downloadAttachmentAsync,
    onViewerOpenChange,
  };
};
