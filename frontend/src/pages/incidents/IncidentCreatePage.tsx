import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../../api/client";
import { useCreateIncident } from "../../api/incidents";
import { useServices } from "../../api/services";
import { LoadingState } from "../../components/AsyncState";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { incidentFormSchema, type IncidentFormValues } from "../../schemas/incident";
import { INCIDENT_SEVERITIES } from "../../types/api";

export default function IncidentCreatePage() {
  useDocumentTitle("New incident");
  const navigate = useNavigate();
  const createIncident = useCreateIncident();
  const services = useServices({ limit: 100, sort: "name" });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<IncidentFormValues>({
    resolver: zodResolver(incidentFormSchema),
    defaultValues: { service_id: "", title: "", severity: "SEV3", description: "" },
  });

  const submit = handleSubmit(async (values) => {
    try {
      const created = await createIncident.mutateAsync({
        service_id: values.service_id,
        title: values.title,
        severity: values.severity,
        description: values.description || null,
      });
      navigate(`/incidents/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.problem.errors) {
        for (const fieldError of err.problem.errors) {
          const field = fieldError.loc.at(-1);
          if (typeof field === "string" && field in values) {
            setError(field as keyof IncidentFormValues, { message: fieldError.msg });
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

  if (services.isLoading) return <LoadingState label="Loading services…" />;

  return (
    <section>
      <h1>New incident</h1>
      <form onSubmit={submit} noValidate>
        {errors.root && (
          <p role="alert" className="form-error form-error-root">
            {errors.root.message}
          </p>
        )}

        <div className="form-field">
          <label htmlFor="service_id">Service</label>
          <select
            id="service_id"
            {...register("service_id")}
            aria-invalid={Boolean(errors.service_id)}
          >
            <option value="">Select a service…</option>
            {services.data?.items.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
          {errors.service_id && <p className="form-error">{errors.service_id.message}</p>}
        </div>

        <div className="form-field">
          <label htmlFor="title">Title</label>
          <input id="title" {...register("title")} aria-invalid={Boolean(errors.title)} />
          {errors.title && <p className="form-error">{errors.title.message}</p>}
        </div>

        <div className="form-field">
          <label htmlFor="severity">Severity</label>
          <select id="severity" {...register("severity")} aria-invalid={Boolean(errors.severity)}>
            {INCIDENT_SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
          {errors.severity && <p className="form-error">{errors.severity.message}</p>}
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
          {isSubmitting ? "Creating…" : "Create incident"}
        </button>
      </form>
    </section>
  );
}
