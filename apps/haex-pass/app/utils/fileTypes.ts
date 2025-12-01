export type FileType = 'image' | 'pdf' | 'text' | 'other';

export function getFileType(fileName: string): FileType {
  const extension = fileName.toLowerCase().split('.').pop() || '';

  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
  if (imageExtensions.includes(extension)) return 'image';

  if (extension === 'pdf') return 'pdf';

  const textExtensions = ['txt', 'md', 'json', 'xml', 'csv', 'log', 'yml', 'yaml', 'ini', 'conf', 'config'];
  if (textExtensions.includes(extension)) return 'text';

  return 'other';
}

export function isImage(fileName: string): boolean {
  return getFileType(fileName) === 'image';
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

export function getMimeType(fileName: string): string {
  const extension = fileName.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
    'svg': 'image/svg+xml',
    'pdf': 'application/pdf',
    'txt': 'text/plain',
    'md': 'text/markdown',
    'json': 'application/json',
    'xml': 'application/xml',
    'csv': 'text/csv',
  };

  return mimeTypes[extension || ''] || 'application/octet-stream';
}

export function createDataUrl(base64Data: string, fileName: string): string {
  // If data already has a data URL prefix, return as-is
  if (base64Data.startsWith('data:')) {
    return base64Data;
  }

  // Otherwise, create data URL with appropriate MIME type
  const mimeType = getMimeType(fileName);
  return `data:${mimeType};base64,${base64Data}`;
}
