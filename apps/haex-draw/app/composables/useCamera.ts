export function useCamera() {
  const stream = ref<MediaStream | null>(null);
  const isActive = ref(false);
  const facingMode = ref<"user" | "environment">("environment");
  const error = ref<string | null>(null);

  const startAsync = async () => {
    error.value = null;
    try {
      stream.value = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode.value },
        audio: false,
      });
      isActive.value = true;
    } catch (e: any) {
      error.value = e.name === "NotAllowedError" ? "permission-denied" : "unavailable";
      console.error("[useCamera] Failed to start camera:", e);
    }
  };

  const stop = () => {
    if (stream.value) {
      for (const track of stream.value.getTracks()) {
        track.stop();
      }
      stream.value = null;
    }
    isActive.value = false;
  };

  const switchCamera = async () => {
    facingMode.value = facingMode.value === "user" ? "environment" : "user";
    if (isActive.value) {
      stop();
      await startAsync();
    }
  };

  const captureAsync = (videoEl: HTMLVideoElement): { dataUrl: string; width: number; height: number } | null => {
    if (!videoEl.videoWidth || !videoEl.videoHeight) return null;

    const canvas = document.createElement("canvas");
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(videoEl, 0, 0);
    return {
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    };
  };

  onUnmounted(() => stop());

  return {
    stream,
    isActive,
    facingMode,
    error,
    startAsync,
    stop,
    switchCamera,
    captureAsync,
  };
}
