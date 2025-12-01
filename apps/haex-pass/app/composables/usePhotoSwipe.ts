import PhotoSwipeLightbox from "photoswipe/lightbox";
import "photoswipe/style.css";

export interface PhotoSwipeItem {
  id: string;
  dataUrl: string;
  fileName: string;
}

export function usePhotoSwipe() {
  const { triggerTabsRerender } = useUiStore();

  /**
   * Opens PhotoSwipe lightbox with the given images
   * @param items Array of images to display
   * @param currentId ID of the image to open initially
   */
  async function openLightboxAsync(
    items: PhotoSwipeItem[],
    currentId: string
  ): Promise<void> {
    // Find the index of the clicked image
    const currentIndex = items.findIndex((item) => item.id === currentId);
    if (currentIndex === -1) return;

    // Load image dimensions for all images
    const photoSwipeItems = await Promise.all(
      items.map(async (item) => {
        // Load image to get actual dimensions
        return new Promise<{
          src: string;
          w: number;
          h: number;
          title: string;
        }>((resolve) => {
          const img = new Image();
          img.onload = () => {
            resolve({
              src: item.dataUrl,
              w: img.width,
              h: img.height,
              title: item.fileName,
            });
          };
          img.onerror = () => {
            // Fallback to default dimensions if image fails to load
            resolve({
              src: item.dataUrl,
              w: 800,
              h: 600,
              title: item.fileName,
            });
          };
          img.src = item.dataUrl;
        });
      })
    );

    // Create and initialize PhotoSwipe lightbox
    const lightbox = new PhotoSwipeLightbox({
      dataSource: photoSwipeItems,
      pswpModule: () => import("photoswipe"),
    });

    // Track rotation state for each slide
    const rotations = new Map<number, number>();

    // Add custom rotate button
    lightbox.on("uiRegister", () => {
      if (!lightbox.pswp?.ui) return;

      lightbox.pswp.ui.registerElement({
        name: "rotate-button",
        ariaLabel: "Rotate image",
        order: 9,
        isButton: true,
        html: '<svg aria-hidden="true" class="pswp__icn" width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M15.55 5.55L11 1v3.07C7.06 4.56 4 7.92 4 12s3.05 7.44 7 7.93v-2.02c-2.84-.48-5-2.94-5-5.91s2.16-5.43 5-5.91V10l4.55-4.45zM19.93 11c-.17-1.39-.72-2.73-1.62-3.89l-1.42 1.42c.54.75.88 1.6 1.02 2.47h2.02zM13 17.9v2.02c1.39-.17 2.74-.71 3.9-1.61l-1.44-1.44c-.75.54-1.59.89-2.46 1.03zm3.89-2.42l1.42 1.41c.9-1.16 1.45-2.5 1.62-3.89h-2.02c-.14.87-.48 1.72-1.02 2.48z"/></svg>',
        onClick: (_event, _el) => {
          if (!lightbox.pswp) return;

          const currentSlide = lightbox.pswp.currSlide;
          if (!currentSlide) return;

          const slideIndex = lightbox.pswp.currIndex;
          const currentRotation = rotations.get(slideIndex) || 0;
          const newRotation = (currentRotation + 90) % 360;
          rotations.set(slideIndex, newRotation);

          // Apply rotation to the image element
          const imageElement = currentSlide.content?.element;
          if (imageElement) {
            imageElement.style.transform = `rotate(${newRotation}deg)`;
          }
        },
      });
    });

    // Reset rotation when slide changes
    lightbox.on("change", () => {
      if (!lightbox.pswp) return;

      const slideIndex = lightbox.pswp.currIndex;
      const rotation = rotations.get(slideIndex) || 0;

      // Apply saved rotation to current slide
      const currentSlide = lightbox.pswp.currSlide;
      const imageElement = currentSlide?.content?.element;
      if (imageElement) {
        imageElement.style.transform = `rotate(${rotation}deg)`;
      }
    });

    // WORKAROUND: Trigger tabs rerender when PhotoSwipe closes
    lightbox.on("destroy", () => {
      triggerTabsRerender();
    });

    lightbox.init();

    // Load and open PhotoSwipe at the clicked image
    lightbox.loadAndOpen(currentIndex);
  }

  return {
    openLightboxAsync,
  };
}
