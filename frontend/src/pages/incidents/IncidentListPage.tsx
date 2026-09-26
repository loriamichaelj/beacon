import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { errorMessage } from "../../api/errorMessage";
import { useIncidents } from "../../api/incidents";
import { useServices } from "../../api/services";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncState";
import { SeverityBadge, StatusBadge } from "../../components/Badges";
import { Icon } from "../../components/Icon";
import { Pagination } from "../../components/Pagination";
import { RelativeTime } from "../../components/RelativeTime";
import { SortableHeader } from "../../components/SortableHeader";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useListParams } from "../../hooks/useListParams";
import { capitalize, formatDuration } from "../../lib/format";
import {
  INCIDENT_SEVERITIES,
  type Incident,
  type IncidentSeverity,
  type IncidentStatus,
} from "../../types/api";

const PAGE_SIZE = 20;
const STATUSES: IncidentStatus[] = ["open", "mitigated", "resolved"];
const DEFAULT_SORT = "-opened_at";

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Resolved: time to resolve. Otherwise: how long it has been going on. */
function Duration({ incident }: { incident: Incident }) {
  if (incident.time_to_resolve_seconds !== null) {
    return <>{formatDuration(incident.time_to_resolve_seconds)}</>;
  }
  const ongoing = (Date.now() - new Date(incident.opened_at).getTime()) / 1000;
  return <span className="muted">{formatDuration(ongoing)} so far</span>;
}

export default function IncidentListPage() {
  useDocumentTitle("Incidents");
  const list = useListParams();
  const statuses = list.getAll("status") as IncidentStatus[];
  const severities = list.getAll("severity") as IncidentSeverity[];
  const serviceId = list.get("service");
  const sort = list.get("sort") || DEFAULT_SORT;
  const q = list.get("q");

  const [search, setSearch] = useState(q);
  const debouncedSearch = useDebouncedValue(search);
  useEffect(() => {
    if (debouncedSearch.trim() !== q) list.update({ q: debouncedSearch.trim() || null });
    // Only react to the debounced input, not to URL changes it caused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const services = useServices({ limit: 100, sort: "name" });
  const { data, isLoading, isError, error, refetch } = useIncidents({
    status: statuses.length ? statuses : undefined,
    severity: severities.length ? severities : undefined,
    service_id: serviceId || undefined,
    q: q || undefined,
    sort,
    limit: PAGE_SIZE,
    offset: list.offset,
  });

  const filtered = Boolean(statuses.length || severities.length || serviceId || q);

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Incidents</h1>
          <p className="page-subtitle">Everything raised against your services, newest first.</p>
        </div>
        <Link className="button button-primary" to="/incidents/new">
          <Icon name="plus" />
          New incident
        </Link>
      </div>

      <div className="toolbar">
        <div className="toolbar-row">
          <label className="search-field">
            <Icon name="search" />
            <span className="visually-hidden">Search incidents</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search titles…"
            />
          </label>
          <label className="inline-field">
            <span>Service</span>
            <select
              value={serviceId}
              onChange={(e) => list.update({ service: e.target.value || null })}
            >
              <option value="">All services</option>
              {services.data?.items.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>
          {filtered && (
            <button
              type="button"
              className="button button-ghost button-small"
              onClick={() => {
                setSearch("");
                list.update({ status: null, severity: null, service: null, q: null });
              }}
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="toolbar-row">
          <div className="chip-group" role="group" aria-label="Status">
            <span className="chip-group-label">Status</span>
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip chip-status-${s}`}
                aria-pressed={statuses.includes(s)}
                onClick={() => list.update({ status: toggle(statuses, s) })}
              >
                {capitalize(s)}
              </button>
            ))}
          </div>
          <div className="chip-group" role="group" aria-label="Severity">
            <span className="chip-group-label">Severity</span>
            {INCIDENT_SEVERITIES.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip chip-${s}`}
                aria-pressed={severities.includes(s)}
                onClick={() => list.update({ severity: toggle(severities, s) })}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && <LoadingState label="Loading incidents…" />}
      {isError && <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />}
      {data && data.items.length === 0 && (
        <EmptyState
          message={filtered ? "No incidents match your filters." : "No incidents yet. All quiet."}
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableHeader
                    label="Title"
                    field="title"
                    sort={sort}
                    onSort={(s) => list.update({ sort: s })}
                  />
                  <th scope="col">Service</th>
                  <SortableHeader
                    label="Severity"
                    field="severity"
                    sort={sort}
                    onSort={(s) => list.update({ sort: s })}
                  />
                  <SortableHeader
                    label="Status"
                    field="status"
                    sort={sort}
                    onSort={(s) => list.update({ sort: s })}
                  />
                  <SortableHeader
                    label="Opened"
                    field="opened_at"
                    sort={sort}
                    firstDirection="desc"
                    onSort={(s) => list.update({ sort: s === DEFAULT_SORT ? null : s })}
                  />
                  <th scope="col">TTR</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((incident) => (
                  <tr key={incident.id}>
                    <td className="cell-primary">
                      <Link to={`/incidents/${incident.id}`}>{incident.title}</Link>
                      {incident.reopen_count > 0 && (
                        <span className="cell-note">Reopened ×{incident.reopen_count}</span>
                      )}
                    </td>
                    <td>
                      <Link className="link-quiet" to={`/services/${incident.service_id}`}>
                        {incident.service_name}
                      </Link>
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
                    <td className="nowrap numeric">
                      <Duration incident={incident} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            total={data.total}
            limit={PAGE_SIZE}
            offset={list.offset}
            onChange={(offset) => list.update({ offset: offset ? String(offset) : null })}
          />
        </>
      )}
    </section>
  );
}
