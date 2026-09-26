import { formatDateTime, formatRelative } from "../lib/format";

/** "3 hours ago", with the exact local time on hover and for assistive tech. */
export function RelativeTime({ iso }: { iso: string }) {
  const exact = formatDateTime(iso);
  return (
    <time dateTime={iso} title={exact}>
      {formatRelative(iso)}
    </time>
  );
}
