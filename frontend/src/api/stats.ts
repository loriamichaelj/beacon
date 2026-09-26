import { useQuery } from "@tanstack/react-query";

import type { ActivityEvent, OverviewStats } from "../types/api";
import { apiRequest } from "./client";

/** Dashboards refresh on their own; incidents move while you watch. */
const REFRESH_MS = 60_000;

export function useOverviewStats(params: { days: number; service_id?: string }) {
  return useQuery({
    queryKey: ["stats", "overview", params],
    queryFn: () => apiRequest<OverviewStats>("/stats/overview", { params }),
    refetchInterval: REFRESH_MS,
  });
}

export function useActivity(params: { limit?: number; service_id?: string } = {}) {
  return useQuery({
    queryKey: ["activity", params],
    queryFn: () => apiRequest<ActivityEvent[]>("/activity", { params }),
    refetchInterval: REFRESH_MS,
  });
}
