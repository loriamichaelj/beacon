import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { errorMessage } from "../../api/errorMessage";
import { useDeleteService, useService } from "../../api/services";
import { useIncidents } from "../../api/incidents";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncState";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";

export default function ServiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: service, isLoading, isError, error } = useService(id);
  const incidents = useIncidents(id ? { service_id: id, limit: 50 } : {});
  const deleteService = useDeleteService();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteErrorMsg, setDeleteErrorMsg] = useState<string | null>(null);

  useDocumentTitle(service ? service.name : "Service");

  if (isLoading) return <LoadingState label="Loading service…" />;
  if (isError) return <ErrorState message={errorMessage(error)} />;
  if (!service || !id) return null;

  async function handleDelete() {
    setConfirmOpen(false);
    try {
      await deleteService.mutateAsync(id as string);
      navigate("/services");
    } catch (err) {
      setDeleteErrorMsg(errorMessage(err));
    }
  }

  return (
    <section>
      <div className="page-header">
        <h1>{service.name}</h1>
        <div className="button-row">
          <Link className="button" to={`/services/${service.id}/edit`}>
            Edit
          </Link>
          <button type="button" className="button-danger" onClick={() => setConfirmOpen(true)}>
            Delete
          </button>
        </div>
      </div>

      {deleteErrorMsg && <ErrorState message={deleteErrorMsg} />}

      <dl className="detail-list">
        <dt>Tier</dt>
        <dd>{service.tier}</dd>
        <dt>Owner team</dt>
        <dd>{service.owner_team}</dd>
        <dt>Runbook</dt>
        <dd>
          {service.runbook_url ? (
            <a href={service.runbook_url} target="_blank" rel="noreferrer">
              {service.runbook_url}
            </a>
          ) : (
            "—"
          )}
        </dd>
        <dt>Description</dt>
        <dd>{service.description || "—"}</dd>
        <dt>Open incidents</dt>
        <dd>{service.open_incident_count}</dd>
      </dl>

      <h2>Incidents</h2>
      {incidents.isLoading && <LoadingState label="Loading incidents…" />}
      {incidents.isError && <ErrorState message={errorMessage(incidents.error)} />}
      {incidents.data && incidents.data.items.length === 0 && (
        <EmptyState message="No incidents for this service." />
      )}
      {incidents.data && incidents.data.items.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Opened</th>
            </tr>
          </thead>
          <tbody>
            {incidents.data.items.map((incident) => (
              <tr key={incident.id}>
                <td>
                  <Link to={`/incidents/${incident.id}`}>{incident.title}</Link>
                </td>
                <td>{incident.severity}</td>
                <td>{incident.status}</td>
                <td>{new Date(incident.opened_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

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
