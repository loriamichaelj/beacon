import { Link, useSearchParams } from "react-router-dom";

import { errorMessage } from "../api/errorMessage";
import { useActivity, useOverviewStats } from "../api/stats";
import { EmptyState, ErrorState, LoadingState } from "../components/AsyncState";
import { SeverityBadge, TierBadge } from "../components/Badges";
import { Icon } from "../components/Icon";
import { IncidentChart } from "../components/IncidentChart";
import { RelativeTime } from "../components/RelativeTime";
import { SegmentedControl } from "../components/SegmentedControl";
import { StatCard } from "../components/StatCard";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { describeEvent, eventIcon, eventTone } from "../lib/events";
import { formatDuration, formatPercent, plural } from "../lib/format";
import { INCIDENT_SEVERITIES, type OverviewStats } from "../types/api";

const WINDOWS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const;
type WindowValue = (typeof WINDOWS)[number]["value"];

function readWindow(params: URLSearchParams): WindowValue {
  const days = params.get("days");
  return WINDOWS.find((w) => w.value === days)?.value ?? "30";
}

const UNRESOLVED = "status=open&status=mitigated";

export default function OverviewPage() {
  useDocumentTitle("Overview");
  const [params, setParams] = useSearchParams();
  const days = readWindow(params);
  const stats = useOverviewStats({ days: Number(days) });

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Overview</h1>
          <p className="page-subtitle">Incident health across every service.</p>
        </div>
        <SegmentedControl
          label="Time window"
          options={WINDOWS}
          value={days}
          onChange={(value) => setParams(value === "30" ? {} : { days: value }, { replace: true })}
        />
      </div>

      {stats.isLoading && <LoadingState label="Loading overview…" />}
      {stats.isError && (
        <ErrorState message={errorMessage(stats.error)} onRetry={() => void stats.refetch()} />
      )}
      {stats.data && <Dashboard stats={stats.data} />}
    </section>
  );
}

function Dashboard({ stats }: { stats: OverviewStats }) {
  const unresolved = stats.active.open + stats.active.mitigated;
  const period = `previous ${plural(stats.window.days, "day")}`;
  const delta = stats.opened - stats.opened_previous;

  return (
    <>
      <div className="stat-grid">
        <StatCard
          label="Unresolved incidents"
          value={unresolved.toLocaleString()}
          tone={
            stats.active.by_severity.SEV1 > 0 ? "critical" : unresolved === 0 ? "good" : "default"
          }
          detail={`${stats.active.open} open · ${stats.active.mitigated} mitigated`}
        />
        <StatCard
          label={`Opened in ${plural(stats.window.days, "day")}`}
          value={stats.opened.toLocaleString()}
          detail={
            delta === 0
              ? `Same as the ${period}`
              : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)} vs the ${period}`
          }
        />
        <StatCard
          label="Median time to mitigate"
          value={formatDuration(stats.median_time_to_mitigate_seconds)}
          detail="Opened → mitigated, for incidents mitigated in this window"
        />
        <StatCard
          label="Median time to resolve"
          value={formatDuration(stats.median_time_to_resolve_seconds)}
          detail={`Opened → resolved, across ${plural(stats.resolved, "resolved incident")}`}
        />
        <StatCard
          label="Reopen rate"
          value={stats.opened ? formatPercent(stats.reopened / stats.opened) : "—"}
          detail={`${stats.reopened} of ${plural(stats.opened, "incident")} opened were reopened`}
        />
      </div>

      <section className="panel" aria-labelledby="severity-heading">
        <div className="panel-header">
          <h2 id="severity-heading">Unresolved by severity</h2>
          <Link to={`/incidents?${UNRESOLVED}`} className="panel-link">
            View all
          </Link>
        </div>
        <ul className="severity-strip">
          {INCIDENT_SEVERITIES.map((sev) => (
            <li key={sev}>
              <Link
                to={`/incidents?${UNRESOLVED}&severity=${sev}`}
                className={`severity-tile sev-tile-${sev}`}
              >
                <SeverityBadge severity={sev} />
                <span className="severity-count">{stats.active.by_severity[sev]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="chart-heading">
        <div className="panel-header">
          <h2 id="chart-heading">Incidents opened per {stats.window.bucket}</h2>
          <span className="muted">{plural(stats.opened, "incident")}</span>
        </div>
        <IncidentChart points={stats.series} bucket={stats.window.bucket} />
      </section>

      <div className="two-column">
        <section className="panel" aria-labelledby="hotspots-heading">
          <div className="panel-header">
            <h2 id="hotspots-heading">Services needing attention</h2>
          </div>
          {stats.hotspots.length === 0 ? (
            <EmptyState message="All clear: no unresolved incidents." />
          ) : (
            <ul className="hotspot-list">
              {stats.hotspots.map((h) => (
                <li key={h.service_id}>
                  <Link to={`/services/${h.service_id}`} className="hotspot-name">
                    {h.service_name}
                  </Link>
                  <TierBadge tier={h.tier} />
                  <Link
                    to={`/incidents?service=${h.service_id}&${UNRESOLVED}`}
                    className="hotspot-count"
                  >
                    {plural(h.active, "unresolved", "unresolved")}
                  </Link>
                  <SeverityBadge severity={h.worst_severity} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <RecentActivity />
      </div>
    </>
  );
}

function RecentActivity() {
  const activity = useActivity({ limit: 8 });
  return (
    <section className="panel" aria-labelledby="activity-heading">
      <div className="panel-header">
        <h2 id="activity-heading">Recent activity</h2>
      </div>
      {activity.isLoading && <LoadingState label="Loading activity…" />}
      {activity.isError && (
        <ErrorState
          message={errorMessage(activity.error)}
          onRetry={() => void activity.refetch()}
        />
      )}
      {activity.data && activity.data.length === 0 && <EmptyState message="No activity yet." />}
      {activity.data && activity.data.length > 0 && (
        <ol className="timeline timeline-compact">
          {activity.data.map((event) => (
            <li key={event.id} className={`timeline-item ${eventTone(event)}`}>
              <span className="timeline-marker">
                <Icon name={eventIcon(event)} size={14} />
              </span>
              <div className="timeline-content">
                <p className="timeline-summary">
                  <Link to={`/incidents/${event.incident_id}`}>{event.incident_title}</Link>
                  <span className="timeline-time">
                    <RelativeTime iso={event.created_at} />
                  </span>
                </p>
                <p className="timeline-meta">
                  {event.kind === "note" ? `“${event.body}”` : describeEvent(event)} ·{" "}
                  {event.service_name}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
