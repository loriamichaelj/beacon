import { useSearchParams } from "react-router-dom";

/**
 * List-page state (filters, sort, page) kept in the URL, so a filtered view
 * can be bookmarked, shared, and survives a reload. Any change other than
 * paging resets to the first page.
 */
export function useListParams() {
  const [params, setParams] = useSearchParams();

  function update(patch: Record<string, string | string[] | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      next.delete(key);
      if (Array.isArray(value)) value.forEach((v) => next.append(key, v));
      else if (value) next.set(key, value);
    }
    if (!("offset" in patch)) next.delete("offset");
    setParams(next, { replace: true });
  }

  return {
    get: (key: string) => params.get(key) ?? "",
    getAll: (key: string) => params.getAll(key),
    offset: Math.max(0, Number(params.get("offset")) || 0),
    update,
  };
}
