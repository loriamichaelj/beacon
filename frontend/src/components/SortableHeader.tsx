interface SortableHeaderProps {
  label: string;
  field: string;
  /** Current sort, e.g. "name" or "-opened_at". */
  sort: string;
  onSort: (sort: string) => void;
  /** The direction a first click sorts in. */
  firstDirection?: "asc" | "desc";
}

/** A column header that sorts on click; the active column carries aria-sort. */
export function SortableHeader({
  label,
  field,
  sort,
  onSort,
  firstDirection = "asc",
}: SortableHeaderProps) {
  const active = sort === field || sort === `-${field}`;
  const descending = sort.startsWith("-");
  const direction = active ? (descending ? "descending" : "ascending") : undefined;

  function next() {
    if (!active) return firstDirection === "desc" ? `-${field}` : field;
    return descending ? field : `-${field}`;
  }

  return (
    <th scope="col" aria-sort={direction}>
      <button type="button" className="sort-button" onClick={() => onSort(next())}>
        {label}
        <span className="sort-indicator" aria-hidden="true">
          {active ? (descending ? "↓" : "↑") : "↕"}
        </span>
      </button>
    </th>
  );
}
