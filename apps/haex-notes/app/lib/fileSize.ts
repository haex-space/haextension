/** Eine Dateigröße für die Liste der Anhänge: „512 B“, „1,5 KB“, „2,0 MB“. */
export function formatBytes(bytes: number, locale = "de"): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const text = unit === 0 ? String(Math.round(value)) : value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${text} ${units[unit]}`;
}
