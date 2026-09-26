/** Display formatting. `null` renders as an em dash: no data, never 0. */

export const NO_VALUE = "—";

/** A duration in the largest unit that reads naturally: 45s, 12m, 3h 20m, 2d 4h. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return NO_VALUE;
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const minutes = Math.round(s / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** "3 hours ago", "yesterday", "just now". */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const diffSeconds = (new Date(iso).getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diffSeconds);
  if (abs < 45) return "just now";
  for (const [unit, size] of RELATIVE_UNITS) {
    if (abs >= size) return relativeFormat.format(Math.round(diffSeconds / size), unit);
  }
  return relativeFormat.format(Math.round(diffSeconds / 60), "minute");
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return NO_VALUE;
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** A UTC bucket's calendar date (buckets are UTC days/weeks, so label in UTC). */
export function formatBucket(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return NO_VALUE;
  return `${Math.round(rate * 100)}%`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
