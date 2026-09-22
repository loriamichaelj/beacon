import { useState } from "react";
import { Link } from "react-router-dom";

import { useServices } from "../../api/services";
import { errorMessage } from "../../api/errorMessage";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncState";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";

const PAGE_SIZE = 20;

export default function ServiceListPage() {
  useDocumentTitle("Services");

  const [q, setQ] = useState("");
  const [tier, setTier] = useState<string>("");
  const [offset, setOffset] = useState(0);

  const { data, isLoading, isError, error } = useServices({
    q: q || undefined,
    tier: tier === "" ? undefined : Number(tier),
    limit: PAGE_SIZE,
    offset,
  });

  return (
    <section>
      <div className="page-header">
        <h1>Services</h1>
        <Link className="button button-primary" to="/services/new">
          New service
        </Link>
      </div>

      <div className="filter-bar">
        <label>
          Search
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOffset(0);
            }}
            placeholder="Filter by name…"
          />
        </label>
        <label>
          Tier
          <select
            value={tier}
            onChange={(e) => {
              setTier(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All</option>
            <option value="0">Tier 0</option>
            <option value="1">Tier 1</option>
            <option value="2">Tier 2</option>
            <option value="3">Tier 3</option>
          </select>
        </label>
      </div>

      {isLoading && <LoadingState label="Loading services…" />}
      {isError && <ErrorState message={errorMessage(error)} />}

      {data && data.items.length === 0 && (
        <EmptyState message="No services match your filters." />
      )}

      {data && data.items.length > 0 && (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Tier</th>
                <th>Owner</th>
                <th>Open incidents</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((service) => (
                <tr key={service.id}>
                  <td>
                    <Link to={`/services/${service.id}`}>{service.name}</Link>
                  </td>
                  <td>{service.tier}</td>
                  <td>{service.owner_team}</td>
                  <td>{service.open_incident_count}</td>
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
