import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { errorMessage } from "../../api/errorMessage";
import { useServices } from "../../api/services";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncState";
import { TierBadge } from "../../components/Badges";
import { Icon } from "../../components/Icon";
import { Pagination } from "../../components/Pagination";
import { RelativeTime } from "../../components/RelativeTime";
import { SegmentedControl } from "../../components/SegmentedControl";
import { SortableHeader } from "../../components/SortableHeader";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useListParams } from "../../hooks/useListParams";

const PAGE_SIZE = 20;
const DEFAULT_SORT = "name";
const TIERS = [
  { value: "", label: "All tiers" },
  { value: "0", label: "Tier 0" },
  { value: "1", label: "Tier 1" },
  { value: "2", label: "Tier 2" },
  { value: "3", label: "Tier 3" },
] as const;
type TierValue = (typeof TIERS)[number]["value"];

export default function ServiceListPage() {
  useDocumentTitle("Services");
  const list = useListParams();
  const q = list.get("q");
  const tier = (TIERS.find((t) => t.value === list.get("tier"))?.value ?? "") as TierValue;
  const team = list.get("owner_team");
  const sort = list.get("sort") || DEFAULT_SORT;

  const [search, setSearch] = useState(q);
  const debouncedSearch = useDebouncedValue(search);
  useEffect(() => {
    if (debouncedSearch.trim() !== q) list.update({ q: debouncedSearch.trim() || null });
    // Only react to the debounced input, not to URL changes it caused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const { data, isLoading, isError, error, refetch } = useServices({
    q: q || undefined,
    tier: tier === "" ? undefined : Number(tier),
    owner_team: team || undefined,
    sort,
    limit: PAGE_SIZE,
    offset: list.offset,
  });
  const onSort = (next: string) => list.update({ sort: next === DEFAULT_SORT ? null : next });

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Services</h1>
          <p className="page-subtitle">The catalog: who owns what, and how critical it is.</p>
        </div>
        <Link className="button button-primary" to="/services/new">
          <Icon name="plus" />
          New service
        </Link>
      </div>

      <div className="toolbar">
        <div className="toolbar-row">
          <label className="search-field">
            <Icon name="search" />
            <span className="visually-hidden">Search services</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name…"
            />
          </label>
          <SegmentedControl
            label="Tier"
            options={TIERS}
            value={tier}
            onChange={(value) => list.update({ tier: value || null })}
          />
          {team && (
            <span className="filter-pill">
              Team: {team}
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove team filter ${team}`}
                onClick={() => list.update({ owner_team: null })}
              >
                <Icon name="close" size={12} />
              </button>
            </span>
          )}
        </div>
      </div>

      {isLoading && <LoadingState label="Loading services…" />}
      {isError && <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />}

      {data && data.items.length === 0 && <EmptyState message="No services match your filters." />}

      {data && data.items.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableHeader label="Name" field="name" sort={sort} onSort={onSort} />
                  <SortableHeader label="Tier" field="tier" sort={sort} onSort={onSort} />
                  <SortableHeader label="Owner" field="owner_team" sort={sort} onSort={onSort} />
                  <th scope="col">Open incidents</th>
                  <SortableHeader
                    label="Added"
                    field="created_at"
                    sort={sort}
                    firstDirection="desc"
                    onSort={onSort}
                  />
                </tr>
              </thead>
              <tbody>
                {data.items.map((service) => (
                  <tr key={service.id}>
                    <td className="cell-primary">
                      <Link to={`/services/${service.id}`}>{service.name}</Link>
                      {service.description && (
                        <span className="cell-note">{service.description}</span>
                      )}
                    </td>
                    <td>
                      <TierBadge tier={service.tier} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="link-button"
                        title={`Show only ${service.owner_team}'s services`}
                        onClick={() => list.update({ owner_team: service.owner_team })}
                      >
                        {service.owner_team}
                      </button>
                    </td>
                    <td>
                      <span
                        className={`count-pill ${service.open_incident_count > 0 ? "count-pill-alert" : ""}`}
                      >
                        {service.open_incident_count}
                      </span>
                    </td>
                    <td className="nowrap">
                      <RelativeTime iso={service.created_at} />
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
