import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { ApiError } from "../../api/client";
import { useCreateIncident } from "../../api/incidents";
import { useServices } from "../../api/services";
import { LoadingState } from "../../components/AsyncState";
import { Icon } from "../../components/Icon";
import { SeverityPicker } from "../../components/SeverityPicker";
import { useToast } from "../../components/toastContext";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { incidentFormSchema, type IncidentFormValues } from "../../schemas/incident";

export default function IncidentCreatePage() {
  useDocumentTitle("New incident");
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const createIncident = useCreateIncident();
  const services = useServices({ limit: 100, sort: "name" });

  if (services.isLoading) return <LoadingState label="Loading services…" />;

  const preselected = params.get("service") ?? "";
  const known = services.data?.items.some((s) => s.id === preselected) ?? false;

  return (
    <section className="page page-narrow">
      <Link to="/incidents" className="back-link">
        <Icon name="back" />
        Incidents
      </Link>
      <div className="page-header">
        <div>
          <h1>New incident</h1>
          <p className="page-subtitle">
            It opens immediately; you can refine the details as you learn more.
          </p>
        </div>
      </div>
      <IncidentForm
        services={services.data?.items ?? []}
        defaultServiceId={known ? preselected : ""}
        onSubmit={async (values) => {
          const created = await createIncident.mutateAsync({
            service_id: values.service_id,
            title: values.title,
            severity: values.severity,
            description: values.description || null,
          });
          toast.show({ tone: "success", message: `Opened "${created.title}".` });
          navigate(`/incidents/${created.id}`);
        }}
      />
    </section>
  );
}

interface IncidentFormProps {
  services: { id: string; name: string }[];
  defaultServiceId: string;
  onSubmit: (values: IncidentFormValues) => Promise<void>;
}

function IncidentForm({ services, defaultServiceId, onSubmit }: IncidentFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<IncidentFormValues>({
    resolver: zodResolver(incidentFormSchema),
    defaultValues: { service_id: defaultServiceId, title: "", severity: "SEV3", description: "" },
  });

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values);
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

  return (
    <form className="panel form-panel" onSubmit={submit} noValidate>
      {errors.root && (
        <p role="alert" className="form-error form-error-root">
          {errors.root.message}
        </p>
      )}

      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="service_id">Service</label>
          <select
            id="service_id"
            {...register("service_id")}
            aria-invalid={Boolean(errors.service_id)}
          >
            <option value="">Select a service…</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
          {errors.service_id && <p className="form-error">{errors.service_id.message}</p>}
        </div>

        <div className="form-field">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            placeholder="e.g. Checkout returning 502s"
            {...register("title")}
            aria-invalid={Boolean(errors.title)}
          />
          {errors.title && <p className="form-error">{errors.title.message}</p>}
        </div>
      </div>

      <SeverityPicker registration={register("severity")} error={errors.severity?.message} />

      <div className="form-field">
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          rows={5}
          placeholder="What's happening, who is affected, and since when?"
          {...register("description")}
          aria-invalid={Boolean(errors.description)}
        />
        {errors.description && <p className="form-error">{errors.description.message}</p>}
      </div>

      <div className="form-actions">
        <button type="submit" className="button button-primary" disabled={isSubmitting}>
          {isSubmitting ? "Creating…" : "Create incident"}
        </button>
        <Link to="/incidents" className="button button-ghost">
          Cancel
        </Link>
      </div>
    </form>
  );
}
