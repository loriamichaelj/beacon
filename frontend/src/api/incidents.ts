import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  Incident,
  IncidentCreateInput,
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

export function useCreateIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: IncidentCreateInput) =>
      apiRequest<Incident>("/incidents", { method: "POST", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
      void queryClient.invalidateQueries({ queryKey: ["services"] });
    },
  });
}

export function useUpdateIncident(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: IncidentUpdateInput) =>
      apiRequest<Incident>(`/incidents/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
      void queryClient.invalidateQueries({ queryKey: ["services"] });
    },
  });
}

export function useDeleteIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<void>(`/incidents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
      void queryClient.invalidateQueries({ queryKey: ["services"] });
    },
  });
}
