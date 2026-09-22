import { z } from "zod";

export const serviceFormSchema = z.object({
  name: z.string().min(1, "Name is required.").max(100, "Name must be 100 characters or fewer."),
  tier: z.coerce.number().int().min(0, "Tier must be 0-3.").max(3, "Tier must be 0-3."),
  owner_team: z
    .string()
    .min(1, "Owner team is required.")
    .max(100, "Owner team must be 100 characters or fewer."),
  runbook_url: z.union([z.string().url("Must be a valid http(s) URL."), z.literal("")]).optional(),
  description: z.string().max(2000, "Description must be 2000 characters or fewer.").optional(),
});

export type ServiceFormValues = z.infer<typeof serviceFormSchema>;
