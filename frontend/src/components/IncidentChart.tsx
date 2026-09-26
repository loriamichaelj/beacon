import { useEffect, useRef, useState } from "react";

import { formatBucket } from "../lib/format";
import { INCIDENT_SEVERITIES, type IncidentSeverity, type SeriesPoint } from "../types/api";

const HEIGHT = 220;
const MARGIN = { top: 12, right: 8, bottom: 28, left: 32 };
const GAP = 2;
const RADIUS = 4;
const MAX_BAR = 24;
const TOOLTIP_W = 160;
// Most severe at the baseline, where heights are easiest to compare.
const STACK_ORDER: readonly IncidentSeverity[] = INCIDENT_SEVERITIES;

function niceScale(max: number): { top: number; step: number } {
  if (max <= 0) return { top: 4, step: 1 };
  for (const step of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]) {
    const top = Math.ceil(max / step) * step;
    if (top / step <= 4) return { top, step };
  }
  const step = 10 ** Math.ceil(Math.log10(max / 4));
  return { top: Math.ceil(max / step) * step, step };
}

/** A rect with its top corners rounded: the data end. The baseline end stays square. */
function topRounded(x: number, y: number, w: number, h: number): string {
  const r = Math.min(RADIUS, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

interface IncidentChartProps {
  points: SeriesPoint[];
  bucket: "day" | "week";
}

/**
 * Incidents opened per day (or week), stacked by severity. Screen readers get
 * the same numbers as a table, since the chart alone isn't accessible.
 */
export function IncidentChart({ points, bucket }: IncidentChartProps) {
  const [ref, width] = useWidth(640);
  const [hover, setHover] = useState<number | null>(null);

  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const { top, step } = niceScale(Math.max(0, ...points.map((p) => p.total)));
  const band = points.length ? plotW / points.length : 0;
  const barW = Math.max(2, Math.min(MAX_BAR, band * 0.64));
  const y = (value: number) => MARGIN.top + plotH - (value / top) * plotH;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(plotW / 64))));
  const unit = bucket === "day" ? "Day" : "Week of";

  const hovered = hover !== null ? points[hover] : null;

  return (
    <figure className="chart">
      <div className="chart-legend" aria-hidden="true">
        {STACK_ORDER.map((sev) => (
          <span key={sev} className="legend-item">
            <span className={`legend-swatch chart-${sev}`} />
            {sev}
          </span>
        ))}
      </div>
      <div className="chart-plot" ref={ref} onMouseLeave={() => setHover(null)}>
        <svg width={width} height={HEIGHT} aria-hidden="true" focusable="false">
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                className={tick === 0 ? "chart-baseline" : "chart-grid"}
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text
                className="chart-tick"
                x={MARGIN.left - 8}
                y={y(tick)}
                dy="0.32em"
                textAnchor="end"
              >
                {tick}
              </text>
            </g>
          ))}
          {points.map((point, i) =>
            i % labelEvery === 0 ? (
              <text
                key={point.start}
                className="chart-tick"
                x={MARGIN.left + band * i + band / 2}
                y={HEIGHT - 8}
                textAnchor="middle"
              >
                {formatBucket(point.start)}
              </text>
            ) : null,
          )}
          {points.map((point, i) => {
            const cx = MARGIN.left + band * i + band / 2;
            const x = cx - barW / 2;
            let base = 0;
            const segments = STACK_ORDER.map((sev) => ({
              sev,
              value: point.by_severity[sev],
            })).filter((s) => s.value > 0);
            return (
              <g
                key={point.start}
                className={hover !== null && hover !== i ? "chart-dim" : undefined}
              >
                {segments.map((segment, j) => {
                  const y0 = y(base);
                  base += segment.value;
                  const y1 = y(base);
                  const isTop = j === segments.length - 1;
                  // A 2px surface gap above every segment but the top one.
                  const h = Math.max(1, y0 - y1 - (isTop ? 0 : GAP));
                  const segTop = y0 - h;
                  return isTop ? (
                    <path
                      key={segment.sev}
                      className={`chart-${segment.sev}`}
                      d={topRounded(x, segTop, barW, h)}
                    />
                  ) : (
                    <rect
                      key={segment.sev}
                      className={`chart-${segment.sev}`}
                      x={x}
                      y={segTop}
                      width={barW}
                      height={h}
                    />
                  );
                })}
                <rect
                  className="chart-hit"
                  x={MARGIN.left + band * i}
                  y={MARGIN.top}
                  width={band}
                  height={plotH}
                  onMouseEnter={() => setHover(i)}
                />
              </g>
            );
          })}
        </svg>
        {hovered && hover !== null && (
          <div
            className="chart-tooltip"
            style={
              MARGIN.left + band * (hover + 1) + TOOLTIP_W + 12 > width
                ? { left: Math.max(0, MARGIN.left + band * hover - TOOLTIP_W - 8) }
                : { left: MARGIN.left + band * (hover + 1) + 8 }
            }
          >
            <p className="chart-tooltip-title">
              {bucket === "week" ? "Week of " : ""}
              {formatBucket(hovered.start)}
            </p>
            {[...STACK_ORDER].map((sev) => (
              <p key={sev} className="chart-tooltip-row">
                <span className={`legend-swatch chart-${sev}`} />
                {sev}
                <strong>{hovered.by_severity[sev]}</strong>
              </p>
            ))}
            <p className="chart-tooltip-row chart-tooltip-total">
              Total <strong>{hovered.total}</strong>
            </p>
          </div>
        )}
      </div>
      <table className="visually-hidden">
        <caption>Incidents opened per {bucket}, by severity</caption>
        <thead>
          <tr>
            <th scope="col">{unit}</th>
            {STACK_ORDER.map((sev) => (
              <th key={sev} scope="col">
                {sev}
              </th>
            ))}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.start}>
              <th scope="row">{formatBucket(point.start)}</th>
              {STACK_ORDER.map((sev) => (
                <td key={sev}>{point.by_severity[sev]}</td>
              ))}
              <td>{point.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
