import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string;
  /** Context under the number, e.g. "vs 4 in the previous 30 days". */
  detail?: ReactNode;
  tone?: "default" | "critical" | "good";
}

export function StatCard({ label, value, detail, tone = "default" }: StatCardProps) {
  return (
    <article className={`stat-card stat-card-${tone}`} aria-label={label}>
      <h3 className="stat-label">{label}</h3>
      <p className="stat-value">{value}</p>
      {detail && <p className="stat-detail">{detail}</p>}
    </article>
  );
}
