/** A small inline icon set: 24px grid, 2px strokes, `currentColor`. */

const PATHS = {
  overview: "M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z",
  services: "M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01",
  incidents: "M12 3 2 20h20L12 3zM12 10v4M12 17h.01",
  plus: "M12 5v14M5 12h14",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  back: "M19 12H5M11 6l-6 6 6 6",
  edit: "M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  mitigate: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z",
  resolve: "M5 12l5 5 9-10",
  reopen: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5",
  note: "M4 5h16v11H9l-5 4V5z",
  severity: "M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4",
  opened: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  close: "M6 6l12 12M18 6 6 18",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  system: "M3 5h18v11H3zM8 20h8M12 16v4",
  book: "M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2V5zM4 19a2 2 0 0 1 2-2h14",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The Beacon mark: a light with signal arcs. */
export function BeaconLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      className="beacon-logo"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="8" fill="var(--color-primary)" />
      <g fill="none" stroke="var(--color-primary-text)" strokeWidth="2.2" strokeLinecap="round">
        <path d="M11.5 11.5a6.4 6.4 0 0 0 0 9" />
        <path d="M20.5 11.5a6.4 6.4 0 0 1 0 9" />
        <path d="M8 8a11.3 11.3 0 0 0 0 16" opacity="0.6" />
        <path d="M24 8a11.3 11.3 0 0 1 0 16" opacity="0.6" />
      </g>
      <circle cx="16" cy="16" r="2.8" fill="var(--color-beacon)" />
    </svg>
  );
}
