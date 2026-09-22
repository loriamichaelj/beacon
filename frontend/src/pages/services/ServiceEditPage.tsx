import { useNavigate, useParams } from "react-router-dom";

import { useService, useUpdateService } from "../../api/services";
import { errorMessage } from "../../api/errorMessage";
import { ErrorState, LoadingState } from "../../components/AsyncState";
import { ServiceForm } from "../../components/ServiceForm";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import type { ServiceFormValues } from "../../schemas/service";

export default function ServiceEditPage() {
  useDocumentTitle("Edit service");
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
    navigate(`/services/${updated.id}`);
    return updated;
  }

  if (isLoading) return <LoadingState label="Loading service…" />;
  if (isError) return <ErrorState message={errorMessage(error)} />;
  if (!service) return null;

  return (
    <section>
      <h1>Edit service</h1>
      <ServiceForm
        submitLabel="Save changes"
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
