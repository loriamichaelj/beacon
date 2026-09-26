import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { errorMessage } from "../../api/errorMessage";
import { useIncidents } from "../../api/incidents";
import { useDeleteService, useService } from "../../api/services";
import { useOverviewStats } from "../../api/stats";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncState";
import { SeverityBadge, StatusBadge, TierBadge } from "../../components/Badges";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Icon } from "../../components/Icon";
import { RelativeTime } from "../../components/RelativeTime";
import { SegmentedControl } from "../../components/SegmentedControl";
import { StatCard } from "../../components/StatCard";
import { useToast } from "../../components/toastContext";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { formatDateTime, formatDuration } from "../../lib/format";
import { TIER_HINTS } from "../../lib/labels";
import type { IncidentStatus } from "../../types/api";

const INCIDENT_LIMIT = 50;
const VIEWS = [
  { value: "active", label: "Unresolved" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
] as const;
type View = (typeof VIEWS)[number]["value"];
const VIEW_STATUSES: Record<View, IncidentStatus[] | undefined> = {
  active: ["open", "mitigated"],
  resolved: ["resolved"],
  all: undefined,
};

export default function ServiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: service, isLoading, isError, error, refetch } = useService(id);
  const [view, setView] = useState<View>("all");
  const incidents = useIncidents(
    id ? { service_id: id, status: VIEW_STATUSES[view], limit: INCIDENT_LIMIT } : {},
  );
  const stats = useOverviewStats({ days: 30, service_id: id });
  const deleteService = useDeleteService();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteErrorMsg, setDeleteErrorMsg] = useState<string | null>(null);

  useDocumentTitle(service ? service.name : "Service");

  if (isLoading) return <LoadingState label="Loading service…" />;
  if (isError) return <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />;
  if (!service || !id) return null;

  async function handleDelete() {
    setConfirmOpen(false);
    try {
      await deleteService.mutateAsync(id as string);
      toast.show({ tone: "success", message: `Deleted ${service?.name}.` });
      navigate("/services");
    } catch (err) {
      setDeleteErrorMsg(errorMessage(err));
    }
  }

  const unresolved = stats.data ? stats.data.active.open + stats.data.active.mitigated : null;

  return (
    <section className="page">
      <Link to="/services" className="back-link">
        <Icon name="back" />
        Services
      </Link>

      <div className="page-header page-header-detail">
        <div>
          <div className="badge-row">
            <TierBadge tier={service.tier} />
            <Link
              to={`/services?owner_team=${encodeURIComponent(service.owner_team)}`}
              className="badge badge-neutral"
            >
              {service.owner_team}
            </Link>
          </div>
          <h1>{service.name}</h1>
          {service.description && <p className="page-subtitle">{service.description}</p>}
        </div>
        <div className="button-row">
          <Link
            className="button button-primary"
            to={`/incidents/new?service=${encodeURIComponent(service.id)}`}
          >
            <Icon name="incidents" />
            Report incident
          </Link>
          <Link className="button" to={`/services/${service.id}/edit`}>
            <Icon name="edit" />
            Edit
          </Link>
          <button
            type="button"
            className="button button-danger"
            onClick={() => setConfirmOpen(true)}
          >
            <Icon name="trash" />
            Delete
          </button>
        </div>
      </div>

      {deleteErrorMsg && <ErrorState message={deleteErrorMsg} />}

      <div className="stat-grid stat-grid-compact">
        <StatCard
          label="Unresolved incidents"
          value={unresolved === null ? "…" : String(unresolved)}
          tone={unresolved ? "critical" : unresolved === 0 ? "good" : "default"}
        />
        <StatCard label="Opened in 30 days" value={stats.data ? String(stats.data.opened) : "…"} />
        <StatCard
          label="Median time to resolve"
          value={stats.data ? formatDuration(stats.data.median_time_to_resolve_seconds) : "…"}
          detail="Last 30 days"
        />
      </div>

      <div className="detail-layout">
        <div className="detail-main">
          <section className="panel" aria-labelledby="incidents-heading">
            <div className="panel-header">
              <h2 id="incidents-heading">Incidents</h2>
              <SegmentedControl label="Show" options={VIEWS} value={view} onChange={setView} />
            </div>
            {incidents.isLoading && <LoadingState label="Loading incidents…" />}
            {incidents.isError && <ErrorState message={errorMessage(incidents.error)} />}
            {incidents.data && incidents.data.items.length === 0 && (
              <EmptyState message="No incidents for this service." />
            )}
            {incidents.data && incidents.data.items.length > 0 && (
              <div className="table-wrap table-wrap-flush">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Title</th>
                      <th scope="col">Severity</th>
                      <th scope="col">Status</th>
                      <th scope="col">Opened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.data.items.map((incident) => (
                      <tr key={incident.id}>
                        <td className="cell-primary">
                          <Link to={`/incidents/${incident.id}`}>{incident.title}</Link>
                        </td>
                        <td>
                          <SeverityBadge severity={incident.severity} />
                        </td>
                        <td>
                          <StatusBadge status={incident.status} />
                        </td>
                        <td className="nowrap">
                          <RelativeTime iso={incident.opened_at} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {incidents.data && incidents.data.total > incidents.data.items.length && (
              <Link to={`/incidents?service=${service.id}`} className="panel-link">
                View all {incidents.data.total} incidents
              </Link>
            )}
          </section>
        </div>

        <aside className="detail-side">
          <section className="panel" aria-labelledby="about-heading">
            <h2 id="about-heading">About</h2>
            <dl className="detail-list">
              <dt>Tier</dt>
              <dd>{TIER_HINTS[service.tier] ?? service.tier}</dd>
              <dt>Owner team</dt>
              <dd>{service.owner_team}</dd>
              <dt>Runbook</dt>
              <dd>
                {service.runbook_url ? (
                  <a href={service.runbook_url} target="_blank" rel="noreferrer">
                    {service.runbook_url} <Icon name="external" size={12} />
                  </a>
                ) : (
                  "—"
                )}
              </dd>
              <dt>Open incidents</dt>
              <dd>{service.open_incident_count}</dd>
              <dt>Added</dt>
              <dd>{formatDateTime(service.created_at)}</dd>
              <dt>Updated</dt>
              <dd>
                <RelativeTime iso={service.updated_at} />
              </dd>
            </dl>
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete service"
        message={`Delete "${service.name}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  );
}
