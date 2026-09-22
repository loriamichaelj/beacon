import { useNavigate } from "react-router-dom";

import { useCreateService } from "../../api/services";
import { ServiceForm } from "../../components/ServiceForm";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import type { ServiceFormValues } from "../../schemas/service";

export default function ServiceCreatePage() {
  useDocumentTitle("New service");
  const navigate = useNavigate();
  const createService = useCreateService();

  async function handleSubmit(values: ServiceFormValues) {
    const created = await createService.mutateAsync({
      name: values.name,
      tier: values.tier,
      owner_team: values.owner_team,
      runbook_url: values.runbook_url || null,
      description: values.description || null,
    });
    navigate(`/services/${created.id}`);
    return created;
  }

  return (
    <section>
      <h1>New service</h1>
      <ServiceForm submitLabel="Create service" onSubmit={handleSubmit} />
    </section>
  );
}
