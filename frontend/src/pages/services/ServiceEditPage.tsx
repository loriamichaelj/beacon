import { Link, useNavigate, useParams } from "react-router-dom";

import { errorMessage } from "../../api/errorMessage";
import { useService, useUpdateService } from "../../api/services";
import { ErrorState, LoadingState } from "../../components/AsyncState";
import { Icon } from "../../components/Icon";
import { ServiceForm } from "../../components/ServiceForm";
import { useToast } from "../../components/toastContext";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import type { ServiceFormValues } from "../../schemas/service";

export default function ServiceEditPage() {
  useDocumentTitle("Edit service");
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: service, isLoading, isError, error } = useService(id);
  const updateService = useUpdateService(id ?? "");

  async function handleSubmit(values: ServiceFormValues) {
    const updated = await updateService.mutateAsync({
      name: values.name,
      tier: values.tier,
      owner_team: values.owner_team,
      runbook_url: values.runbook_url || null,
      description: values.description || null,
    });
    toast.show({ tone: "success", message: `Saved ${updated.name}.` });
    navigate(`/services/${updated.id}`);
    return updated;
  }

  if (isLoading) return <LoadingState label="Loading service…" />;
  if (isError) return <ErrorState message={errorMessage(error)} />;
  if (!service) return null;

  return (
    <section className="page page-narrow">
      <Link to={`/services/${service.id}`} className="back-link">
        <Icon name="back" />
        {service.name}
      </Link>
      <div className="page-header">
        <h1>Edit service</h1>
      </div>
      <ServiceForm
        submitLabel="Save changes"
        cancelTo={`/services/${service.id}`}
        defaultValues={{
          name: service.name,
          tier: service.tier,
          owner_team: service.owner_team,
          runbook_url: service.runbook_url ?? "",
          description: service.description ?? "",
        }}
        onSubmit={handleSubmit}
      />
    </section>
  );
}
