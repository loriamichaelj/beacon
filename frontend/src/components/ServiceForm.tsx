import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { ApiError } from "../api/client";
import { serviceFormSchema, type ServiceFormValues } from "../schemas/service";
import type { Service } from "../types/api";

interface ServiceFormProps {
  defaultValues?: Partial<ServiceFormValues>;
  submitLabel: string;
  onSubmit: (values: ServiceFormValues) => Promise<Service>;
}

export function ServiceForm({ defaultValues, submitLabel, onSubmit }: ServiceFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: {
      name: "",
      tier: 0,
      owner_team: "",
      runbook_url: "",
      description: "",
      ...defaultValues,
    },
  });

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values);
    } catch (err) {
      if (err instanceof ApiError && err.problem.errors) {
        for (const fieldError of err.problem.errors) {
          const field = fieldError.loc.at(-1);
          if (typeof field === "string" && field in values) {
            setError(field as keyof ServiceFormValues, { message: fieldError.msg });
          }
        }
        return;
      }
      if (err instanceof ApiError) {
        setError("root", { message: err.problem.detail });
        return;
      }
      throw err;
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      {errors.root && (
        <p role="alert" className="form-error form-error-root">
          {errors.root.message}
        </p>
      )}

      <div className="form-field">
        <label htmlFor="name">Name</label>
        <input id="name" {...register("name")} aria-invalid={Boolean(errors.name)} />
        {errors.name && <p className="form-error">{errors.name.message}</p>}
      </div>

      <div className="form-field">
        <label htmlFor="tier">Tier</label>
        <select id="tier" {...register("tier")} aria-invalid={Boolean(errors.tier)}>
          <option value={0}>Tier 0</option>
          <option value={1}>Tier 1</option>
          <option value={2}>Tier 2</option>
          <option value={3}>Tier 3</option>
        </select>
        {errors.tier && <p className="form-error">{errors.tier.message}</p>}
      </div>

      <div className="form-field">
        <label htmlFor="owner_team">Owner team</label>
        <input
          id="owner_team"
          {...register("owner_team")}
          aria-invalid={Boolean(errors.owner_team)}
        />
        {errors.owner_team && <p className="form-error">{errors.owner_team.message}</p>}
      </div>

      <div className="form-field">
        <label htmlFor="runbook_url">Runbook URL</label>
        <input
          id="runbook_url"
          type="url"
          {...register("runbook_url")}
          aria-invalid={Boolean(errors.runbook_url)}
        />
        {errors.runbook_url && <p className="form-error">{errors.runbook_url.message}</p>}
      </div>

      <div className="form-field">
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          rows={4}
          {...register("description")}
          aria-invalid={Boolean(errors.description)}
        />
        {errors.description && <p className="form-error">{errors.description.message}</p>}
      </div>

      <button type="submit" className="button button-primary" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
