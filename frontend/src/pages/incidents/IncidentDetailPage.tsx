import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { errorMessage } from "../../api/errorMessage";
import { useDeleteIncident, useIncident, useUpdateIncident } from "../../api/incidents";
import { useService } from "../../api/services";
import { ErrorState, LoadingState } from "../../components/AsyncState";
import { SeverityBadge, StatusBadge } from "../../components/Badges";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Icon, type IconName } from "../../components/Icon";
import { IncidentEditDialog } from "../../components/IncidentEditDialog";
import { IncidentTimeline } from "../../components/IncidentTimeline";
import { RelativeTime } from "../../components/RelativeTime";
import { useToast } from "../../components/toastContext";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { formatDateTime, formatDuration, NO_VALUE } from "../../lib/format";
import { VALID_TRANSITIONS, type IncidentStatus } from "../../types/api";

const TRANSITION_ICONS: Record<IncidentStatus, IconName> = {
  open: "reopen",
  mitigated: "mitigate",
  resolved: "resolve",
};

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: incident, isLoading, isError, error, refetch } = useIncident(id);
  const service = useService(incident?.service_id);
  const updateIncident = useUpdateIncident(id ?? "");
  const deleteIncident = useDeleteIncident();
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useDocumentTitle(incident ? incident.title : "Incident");

  if (isLoading) return <LoadingState label="Loading incident…" />;
  if (isError) return <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />;
  if (!incident || !id) return null;

  const nextStatuses = VALID_TRANSITIONS[incident.status];
  const openFor =
    incident.status === "resolved"
      ? null
      : (Date.now() - new Date(incident.opened_at).getTime()) / 1000;

  async function transitionTo(status: IncidentStatus) {
    setTransitionError(null);
    try {
      await updateIncident.mutateAsync({ status });
      toast.show({ tone: "success", message: `Incident marked ${status}.` });
    } catch (err) {
      setTransitionError(errorMessage(err));
    }
  }

  async function handleDelete() {
    setConfirmDelete(false);
    try {
      await deleteIncident.mutateAsync(id as string);
      toast.show({ tone: "success", message: "Incident deleted." });
      navigate("/incidents");
    } catch (err) {
      setTransitionError(errorMessage(err));
    }
  }

  return (
    <section className="page">
      <Link to="/incidents" className="back-link">
        <Icon name="back" />
        Incidents
      </Link>

      <div className="page-header page-header-detail">
        <div>
          <div className="badge-row">
            <SeverityBadge severity={incident.severity} />
            <StatusBadge status={incident.status} />
            {incident.reopen_count > 0 && (
              <span className="badge badge-neutral">Reopened ×{incident.reopen_count}</span>
            )}
          </div>
          <h1>{incident.title}</h1>
          <p className="page-subtitle">
            <Link to={`/services/${incident.service_id}`}>{incident.service_name}</Link> · opened{" "}
            <RelativeTime iso={incident.opened_at} />
            {openFor !== null && <> · ongoing for {formatDuration(openFor)}</>}
          </p>
        </div>
        <div className="button-row">
          <button type="button" className="button" onClick={() => setEditing(true)}>
            <Icon name="edit" />
            Edit
          </button>
          <button
            type="button"
            className="button button-danger"
            onClick={() => setConfirmDelete(true)}
          >
            <Icon name="trash" />
            Delete
          </button>
        </div>
      </div>

      {transitionError && <ErrorState message={transitionError} />}

      <div className="action-bar" role="group" aria-label="Change status">
        <span className="action-bar-label">Change status</span>
        {nextStatuses.map((status) => (
          <button
            key={status}
            type="button"
            className={`button ${status === "resolved" ? "button-primary" : ""}`}
            disabled={updateIncident.isPending}
            onClick={() => transitionTo(status)}
          >
            <Icon name={TRANSITION_ICONS[status]} />
            Mark as {status}
          </button>
        ))}
      </div>

      <div className="detail-layout">
        <div className="detail-main">
          <section className="panel" aria-labelledby="description-heading">
            <h2 id="description-heading">Description</h2>
            {incident.description ? (
              <p className="prose">{incident.description}</p>
            ) : (
              <p className="muted">No description.</p>
            )}
          </section>
          <IncidentTimeline incidentId={incident.id} />
        </div>

        <aside className="detail-side">
          <section className="panel" aria-labelledby="details-heading">
            <h2 id="details-heading">Details</h2>
            <dl className="detail-list">
              <dt>Service</dt>
              <dd>
                <Link to={`/services/${incident.service_id}`}>{incident.service_name}</Link>
              </dd>
              <dt>Runbook</dt>
              <dd>
                {service.data?.runbook_url ? (
                  <a href={service.data.runbook_url} target="_blank" rel="noreferrer">
                    Open runbook <Icon name="external" size={12} />
                  </a>
                ) : (
                  NO_VALUE
                )}
              </dd>
              <dt>Opened</dt>
              <dd>{formatDateTime(incident.opened_at)}</dd>
              <dt>Mitigated</dt>
              <dd>{formatDateTime(incident.mitigated_at)}</dd>
              <dt>Resolved</dt>
              <dd>{formatDateTime(incident.resolved_at)}</dd>
              <dt>Time to mitigate</dt>
              <dd>{formatDuration(incident.time_to_mitigate_seconds)}</dd>
              <dt>Time to resolve</dt>
              <dd>{formatDuration(incident.time_to_resolve_seconds)}</dd>
              <dt>Reopened</dt>
              <dd>{incident.reopen_count} time(s)</dd>
            </dl>
          </section>
        </aside>
      </div>

      <IncidentEditDialog incident={incident} open={editing} onClose={() => setEditing(false)} />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete incident"
        message={`Delete "${incident.title}" and its timeline? This cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </section>
  );
}
