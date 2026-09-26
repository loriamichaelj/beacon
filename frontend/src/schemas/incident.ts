import { z } from "zod";

import { INCIDENT_SEVERITIES } from "../types/api";

const title = z
  .string()
  .trim()
  .min(1, "Title is required.")
  .max(200, "Title must be 200 characters or fewer.");
const severity = z.enum(INCIDENT_SEVERITIES, {
  errorMap: () => ({ message: "Select a severity." }),
});
const description = z
  .string()
  .max(10000, "Description must be 10000 characters or fewer.")
  .optional();

export const incidentFormSchema = z.object({
  service_id: z.string().min(1, "Service is required."),
  title,
  severity,
  description,
});

export type IncidentFormValues = z.infer<typeof incidentFormSchema>;

export const incidentEditSchema = z.object({ title, severity, description });

export type IncidentEditValues = z.infer<typeof incidentEditSchema>;

export const SEVERITY_HINTS: Record<(typeof INCIDENT_SEVERITIES)[number], string> = {
  SEV1: "Critical: outage or data loss for many customers",
  SEV2: "Major: significant degradation, workaround hard",
  SEV3: "Minor: limited impact, workaround exists",
  SEV4: "Low: cosmetic or no customer impact",
};
