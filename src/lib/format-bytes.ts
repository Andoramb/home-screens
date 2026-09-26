const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/**
 * A byte count as people read it: "461 KB", "3.1 MB", "11 GB". One decimal
 * below ten, none above. With a `locale` the number follows that locale's
 * decimal mark ("3,1 MB" in German); the unit letters are the same everywhere.
 */
export function formatBytes(bytes: number, locale?: string): string {
  if (!(bytes > 0)) return '0 B';
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / Math.pow(1024, i);
  const digits = value < 10 ? 1 : 0;
  const number = locale
    ? new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
    : digits ? value.toFixed(1) : String(Math.round(value));
  return `${number} ${UNITS[i]}`;
}
