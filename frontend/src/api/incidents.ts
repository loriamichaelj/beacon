import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  Incident,
  IncidentCreateInput,
  IncidentEvent,
  IncidentStatus,
  IncidentUpdateInput,
  Page,
} from "../types/api";
import { apiRequest } from "./client";

export interface IncidentListParams {
  service_id?: string;
  status?: IncidentStatus[];
  severity?: string[];
  opened_after?: string;
  opened_before?: string;
  q?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

export function useIncidents(params: IncidentListParams = {}) {
  return useQuery({
    queryKey: ["incidents", params],
    queryFn: () => apiRequest<Page<Incident>>("/incidents", { params }),
  });
}

export function useIncident(id: string | undefined) {
  return useQuery({
    queryKey: ["incidents", id],
    queryFn: () => apiRequest<Incident>(`/incidents/${id}`),
    enabled: Boolean(id),
  });
}

export function useIncidentEvents(id: string | undefined) {
  return useQuery({
    queryKey: ["incidents", id, "events"],
    queryFn: () => apiRequest<Page<IncidentEvent>>(`/incidents/${id}/events`),
    enabled: Boolean(id),
  });
}

export function useAddNote(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      apiRequest<IncidentEvent>(`/incidents/${id}/events`, { method: "POST", body: { body } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["incidents", id, "events"] });
      void queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

/** Queries every incident change can affect: lists, counts, stats, the feed. */
function invalidateIncidentViews(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["incidents"] });
  void queryClient.invalidateQueries({ queryKey: ["services"] });
  void queryClient.invalidateQueries({ queryKey: ["stats"] });
  void queryClient.invalidateQueries({ queryKey: ["activity"] });
}

export function useCreateIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: IncidentCreateInput) =>
      apiRequest<Incident>("/incidents", { method: "POST", body: input }),
    onSuccess: () => invalidateIncidentViews(queryClient),
  });
}

export function useUpdateIncident(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: IncidentUpdateInput) =>
      apiRequest<Incident>(`/incidents/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => invalidateIncidentViews(queryClient),
  });
}

export function useDeleteIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<void>(`/incidents/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidateIncidentViews(queryClient),
  });
}

/** Unresolved incidents across all services, for the nav badge. */
export function useActiveIncidentCount() {
  const params = { status: ["open", "mitigated"] as IncidentStatus[], limit: 1 };
  return useQuery({
    queryKey: ["incidents", params],
    queryFn: () => apiRequest<Page<Incident>>("/incidents", { params }),
    select: (page) => page.total,
    refetchInterval: 60_000,
  });
}
