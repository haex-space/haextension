import type { DirEntry } from "@haex-space/vault-sdk";

export interface ImageEntry {
  path: string;
  name: string;
  modified: number;
  thumbnail: string | null;
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp"]);
const THUMBNAIL_SIZE = 160; // px (rendered at 80px, 2x for retina)
const CACHE_MAX = 200;

function getExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function isImageFile(entry: DirEntry): boolean {
  return entry.isFile && IMAGE_EXTENSIONS.has(getExtension(entry.name));
}

export function useImageGallery() {
  const haexVault = useHaexVaultStore();

  const images = ref<ImageEntry[]>([]);
  const isScanning = ref(false);

  // Simple LRU cache: Map preserves insertion order, we delete oldest when full
  const thumbnailCache = new Map<string, string>();

  const getMimeType = (path: string): string => {
    const ext = getExtension(path.split("/").pop() ?? "");
    const mimeMap: Record<string, string> = {
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
      webp: "image/webp", gif: "image/gif", bmp: "image/bmp",
    };
    return mimeMap[ext] ?? "image/png";
  };

  const scanDirRecursive = async (
    dirPath: string,
    results: ImageEntry[],
    depth = 0,
    maxDepth = 3,
  ) => {
    if (depth > maxDepth) return;

    try {
      const entries = await haexVault.client.filesystem.readDir(dirPath);

      for (const entry of entries) {
        if (isImageFile(entry)) {
          results.push({
            path: entry.path,
            name: entry.name,
            modified: entry.modified ?? 0,
            thumbnail: null,
          });
        } else if (entry.isDirectory && !entry.name.startsWith(".")) {
          await scanDirRecursive(entry.path, results, depth + 1, maxDepth);
        }
      }
    } catch {
      // Permission denied or directory doesn't exist – skip silently
    }
  };

  const scanAsync = async () => {
    isScanning.value = true;
    const results: ImageEntry[] = [];

    const fs = haexVault.client.filesystem;

    // Use SDK knownPaths to get platform-resolved directories
    let paths: Record<string, string>;
    try {
      paths = await fs.knownPaths() as Record<string, string>;
    } catch {
      isScanning.value = false;
      return;
    }

    // Collect all directories to scan (pictures, downloads, documents, + DCIM on Android)
    const scanPaths = new Set<string>();
    if (paths.pictures) scanPaths.add(paths.pictures);
    if (paths.downloads) scanPaths.add(paths.downloads);
    if (paths.documents) scanPaths.add(paths.documents);

    // On Android, also scan DCIM under home
    if (paths.home) {
      const dcimPath = `${paths.home}/DCIM`;
      const dcimExists = await fs.exists(dcimPath).catch(() => false);
      if (dcimExists) scanPaths.add(dcimPath);
    }

    // Scan all directories in parallel
    const scanPromises = [...scanPaths].map(async (dirPath) => {
      const exists = await fs.exists(dirPath).catch(() => false);
      if (exists) {
        await scanDirRecursive(dirPath, results);
      }
    });

    await Promise.all(scanPromises);

    // Sort by modified date (newest first)
    results.sort((a, b) => b.modified - a.modified);
    images.value = results;
    isScanning.value = false;
  };

  const loadThumbnailAsync = async (path: string): Promise<string | null> => {
    // Check cache first
    const cached = thumbnailCache.get(path);
    if (cached) {
      // Move to end (most recently used)
      thumbnailCache.delete(path);
      thumbnailCache.set(path, cached);
      return cached;
    }

    try {
      const data = await haexVault.client.filesystem.readFile(path);
      const mime = getMimeType(path);

      // Convert to base64
      let binary = "";
      for (let i = 0; i < data.length; i++) {
        binary += String.fromCharCode(data[i]!);
      }
      const fullDataUrl = `data:${mime};base64,${btoa(binary)}`;

      // Resize to thumbnail
      const thumbnailUrl = await resizeToThumbnail(fullDataUrl);

      // Store in cache, evict oldest if full
      if (thumbnailCache.size >= CACHE_MAX) {
        const oldest = thumbnailCache.keys().next().value!;
        thumbnailCache.delete(oldest);
      }
      thumbnailCache.set(path, thumbnailUrl);

      // Update the entry
      const entry = images.value.find((e) => e.path === path);
      if (entry) entry.thumbnail = thumbnailUrl;

      return thumbnailUrl;
    } catch {
      return null;
    }
  };

  const loadFullImageAsync = async (path: string): Promise<{ dataUrl: string; width: number; height: number } | null> => {
    try {
      const data = await haexVault.client.filesystem.readFile(path);
      const mime = getMimeType(path);

      let binary = "";
      for (let i = 0; i < data.length; i++) {
        binary += String.fromCharCode(data[i]!);
      }
      const dataUrl = `data:${mime};base64,${btoa(binary)}`;

      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      });
    } catch {
      return null;
    }
  };

  return {
    images,
    isScanning,
    scanAsync,
    loadThumbnailAsync,
    loadFullImageAsync,
  };
}

function resizeToThumbnail(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = THUMBNAIL_SIZE / Math.max(img.naturalWidth, img.naturalHeight);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => resolve(dataUrl); // Fallback to original
    img.src = dataUrl;
  });
}
