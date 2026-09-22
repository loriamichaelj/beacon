import { useState } from "react";
import { Link } from "react-router-dom";

import { useIncidents } from "../../api/incidents";
import { errorMessage } from "../../api/errorMessage";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncState";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { INCIDENT_SEVERITIES, type IncidentSeverity, type IncidentStatus } from "../../types/api";

const PAGE_SIZE = 20;
const STATUSES: IncidentStatus[] = ["open", "mitigated", "resolved"];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function formatSeconds(seconds: number | null): string {
  if (seconds === null) return "—";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

export default function IncidentListPage() {
  useDocumentTitle("Incidents");

  const [statuses, setStatuses] = useState<IncidentStatus[]>([]);
  const [severities, setSeverities] = useState<IncidentSeverity[]>([]);
  const [offset, setOffset] = useState(0);

  const { data, isLoading, isError, error } = useIncidents({
    status: statuses.length ? statuses : undefined,
    severity: severities.length ? severities : undefined,
    limit: PAGE_SIZE,
    offset,
  });

  return (
    <section>
      <div className="page-header">
        <h1>Incidents</h1>
        <Link className="button button-primary" to="/incidents/new">
          New incident
        </Link>
      </div>

      <fieldset className="filter-bar">
        <legend>Status</legend>
        {STATUSES.map((s) => (
          <label key={s} className="checkbox-label">
            <input
              type="checkbox"
              checked={statuses.includes(s)}
              onChange={() => {
                setStatuses((prev) => toggle(prev, s));
                setOffset(0);
              }}
            />
            {s}
          </label>
        ))}
      </fieldset>

      <fieldset className="filter-bar">
        <legend>Severity</legend>
        {INCIDENT_SEVERITIES.map((s) => (
          <label key={s} className="checkbox-label">
            <input
              type="checkbox"
              checked={severities.includes(s)}
              onChange={() => {
                setSeverities((prev) => toggle(prev, s));
                setOffset(0);
              }}
            />
            {s}
          </label>
        ))}
      </fieldset>

      {isLoading && <LoadingState label="Loading incidents…" />}
      {isError && <ErrorState message={errorMessage(error)} />}
      {data && data.items.length === 0 && <EmptyState message="No incidents match your filters." />}

      {data && data.items.length > 0 && (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Service</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Opened</th>
                <th>TTR</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((incident) => (
                <tr key={incident.id}>
                  <td>
                    <Link to={`/incidents/${incident.id}`}>{incident.title}</Link>
                  </td>
                  <td>
                    <Link to={`/services/${incident.service_id}`}>{incident.service_name}</Link>
                  </td>
                  <td>{incident.severity}</td>
                  <td>{incident.status}</td>
                  <td>{new Date(incident.opened_at).toLocaleString()}</td>
                  <td>{formatSeconds(incident.time_to_resolve_seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pagination">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </button>
            <span>
              {offset + 1}–{Math.min(offset + PAGE_SIZE, data.total)} of {data.total}
            </span>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= data.total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}
