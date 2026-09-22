import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { errorMessage } from "../../api/errorMessage";
import { useIncident, useUpdateIncident } from "../../api/incidents";
import { ErrorState, LoadingState } from "../../components/AsyncState";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { VALID_TRANSITIONS, type IncidentStatus } from "../../types/api";

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `${hours} h`;
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: incident, isLoading, isError, error } = useIncident(id);
  const updateIncident = useUpdateIncident(id ?? "");
  const [transitionError, setTransitionError] = useState<string | null>(null);

  useDocumentTitle(incident ? incident.title : "Incident");

  if (isLoading) return <LoadingState label="Loading incident…" />;
  if (isError) return <ErrorState message={errorMessage(error)} />;
  if (!incident) return null;

  const nextStatuses = VALID_TRANSITIONS[incident.status];

  async function transitionTo(status: IncidentStatus) {
    setTransitionError(null);
    try {
      await updateIncident.mutateAsync({ status });
    } catch (err) {
      setTransitionError(errorMessage(err));
    }
  }

  return (
    <section>
      <div className="page-header">
        <h1>{incident.title}</h1>
        <span className={`status-badge status-${incident.status}`}>{incident.status}</span>
      </div>

      {transitionError && <ErrorState message={transitionError} />}

      <dl className="detail-list">
        <dt>Service</dt>
        <dd>
          <Link to={`/services/${incident.service_id}`}>{incident.service_name}</Link>
        </dd>
        <dt>Severity</dt>
        <dd>{incident.severity}</dd>
        <dt>Description</dt>
        <dd>{incident.description || "—"}</dd>
        <dt>Opened</dt>
        <dd>{formatDate(incident.opened_at)}</dd>
        <dt>Mitigated</dt>
        <dd>{formatDate(incident.mitigated_at)}</dd>
        <dt>Resolved</dt>
        <dd>{formatDate(incident.resolved_at)}</dd>
        <dt>Time to mitigate</dt>
        <dd>{formatDuration(incident.time_to_mitigate_seconds)}</dd>
        <dt>Time to resolve</dt>
        <dd>{formatDuration(incident.time_to_resolve_seconds)}</dd>
        <dt>Reopened</dt>
        <dd>{incident.reopen_count} time(s)</dd>
      </dl>

      <h2>Change status</h2>
      <div className="button-row">
        {nextStatuses.map((status) => (
          <button
            key={status}
            type="button"
            className="button"
            disabled={updateIncident.isPending}
            onClick={() => transitionTo(status)}
          >
            Mark as {status}
          </button>
        ))}
      </div>
    </section>
  );
}
