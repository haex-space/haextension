const stopTracks = (stream: MediaStream) => {
  for (const track of stream.getTracks()) {
    track.stop();
  }
};

export function useCamera() {
  const stream = ref<MediaStream | null>(null);
  const isActive = ref(false);
  const facingMode = ref<"user" | "environment">("environment");
  const error = ref<string | null>(null);

  // getUserMedia can resolve after the overlay closed or a newer start began;
  // such a late stream must be stopped, or the camera stays on.
  let startToken = 0;
  let disposed = false;

  const startAsync = async () => {
    const token = ++startToken;
    error.value = null;
    try {
      const started = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode.value },
        audio: false,
      });
      if (disposed || token !== startToken) {
        stopTracks(started);
        return;
      }
      stream.value = started;
      isActive.value = true;
    } catch (e) {
      if (token !== startToken) return;
      error.value = e instanceof DOMException && e.name === "NotAllowedError" ? "permission-denied" : "unavailable";
      console.error("[useCamera] Failed to start camera:", e);
    }
  };

  const stop = () => {
    startToken++;
    if (stream.value) {
      stopTracks(stream.value);
      stream.value = null;
    }
    isActive.value = false;
  };

  const switchCamera = async () => {
    facingMode.value = facingMode.value === "user" ? "environment" : "user";
    stop();
    await startAsync();
  };

  const capture = (videoEl: HTMLVideoElement): { dataUrl: string; width: number; height: number } | null => {
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

  onUnmounted(() => {
    disposed = true;
    stop();
  });

  return {
    stream,
    isActive,
    facingMode,
    error,
    startAsync,
    stop,
    switchCamera,
    capture,
  };
}
