import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";

import { ApiError } from "../api/client";
import { serviceFormSchema, type ServiceFormValues } from "../schemas/service";
import type { Service } from "../types/api";
import { TIER_HINTS } from "../lib/labels";

interface ServiceFormProps {
  defaultValues?: Partial<ServiceFormValues>;
  submitLabel: string;
  onSubmit: (values: ServiceFormValues) => Promise<Service>;
  /** Where Cancel goes; omitted, there's no Cancel link. */
  cancelTo?: string;
}

export function ServiceForm({ defaultValues, submitLabel, onSubmit, cancelTo }: ServiceFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    watch,
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
    <form className="panel form-panel" onSubmit={submit} noValidate>
      {errors.root && (
        <p role="alert" className="form-error form-error-root">
          {errors.root.message}
        </p>
      )}

      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            placeholder="e.g. checkout-api"
            {...register("name")}
            aria-invalid={Boolean(errors.name)}
          />
          {errors.name && <p className="form-error">{errors.name.message}</p>}
        </div>

        <div className="form-field">
          <label htmlFor="owner_team">Owner team</label>
          <input
            id="owner_team"
            placeholder="e.g. payments"
            {...register("owner_team")}
            aria-invalid={Boolean(errors.owner_team)}
          />
          {errors.owner_team && <p className="form-error">{errors.owner_team.message}</p>}
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="tier">Tier</label>
        <select
          id="tier"
          {...register("tier")}
          aria-invalid={Boolean(errors.tier)}
          aria-describedby="tier-hint"
        >
          {[0, 1, 2, 3].map((tier) => (
            <option key={tier} value={tier}>
              Tier {tier}
            </option>
          ))}
        </select>
        <p id="tier-hint" className="form-hint">
          {TIER_HINTS[Number(watch("tier"))] ?? ""}
        </p>
        {errors.tier && <p className="form-error">{errors.tier.message}</p>}
      </div>

      <div className="form-field">
        <label htmlFor="runbook_url">Runbook URL</label>
        <input
          id="runbook_url"
          type="url"
          placeholder="https://"
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
          placeholder="What does this service do, and who depends on it?"
          {...register("description")}
          aria-invalid={Boolean(errors.description)}
        />
        {errors.description && <p className="form-error">{errors.description.message}</p>}
      </div>

      <div className="form-actions">
        <button type="submit" className="button button-primary" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </button>
        {cancelTo && (
          <Link to={cancelTo} className="button button-ghost">
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
