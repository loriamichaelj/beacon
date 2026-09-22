import { z } from "zod";

import { INCIDENT_SEVERITIES } from "../types/api";

export const incidentFormSchema = z.object({
  service_id: z.string().min(1, "Service is required."),
  title: z.string().min(1, "Title is required.").max(200, "Title must be 200 characters or fewer."),
  severity: z.enum(INCIDENT_SEVERITIES, {
    errorMap: () => ({ message: "Select a severity." }),
  }),
  description: z.string().max(10000, "Description must be 10000 characters or fewer.").optional(),
});

export type IncidentFormValues = z.infer<typeof incidentFormSchema>;
