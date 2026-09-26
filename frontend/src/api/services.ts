import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Page, Service, ServiceCreateInput, ServiceUpdateInput } from "../types/api";
import { apiRequest } from "./client";

export interface ServiceListParams {
  tier?: number;
  owner_team?: string;
  q?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

export function useServices(params: ServiceListParams = {}) {
  return useQuery({
    queryKey: ["services", params],
    queryFn: () => apiRequest<Page<Service>>("/services", { params }),
  });
}

export function useService(id: string | undefined) {
  return useQuery({
    queryKey: ["services", id],
    queryFn: () => apiRequest<Service>(`/services/${id}`),
    enabled: Boolean(id),
  });
}

/** A service's name and tier also show up in stats and the activity feed. */
function invalidateServiceViews(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["services"] });
  void queryClient.invalidateQueries({ queryKey: ["stats"] });
  void queryClient.invalidateQueries({ queryKey: ["activity"] });
}

export function useCreateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ServiceCreateInput) =>
      apiRequest<Service>("/services", { method: "POST", body: input }),
    onSuccess: () => invalidateServiceViews(queryClient),
  });
}

export function useUpdateService(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ServiceUpdateInput) =>
      apiRequest<Service>(`/services/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => invalidateServiceViews(queryClient),
  });
}

export function useDeleteService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<void>(`/services/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidateServiceViews(queryClient),
  });
}
